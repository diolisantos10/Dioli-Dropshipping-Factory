import { createHash, randomUUID } from 'node:crypto';
import { getDatabasePool, readState } from './server-state';
import { runServerCommand } from './command-runner';
import { emptyMedia, approvedStudioAssets, studioReadiness, type MediaProductionRequest, type MediaState } from './media-factory';
import { emptyProductFactory, type ProductFactoryState } from './product-factory';
import { assessStudioSourceBatch, generateReviewedStudioImage, STUDIO_ANGLES } from './studio-gateway';
import { GatewayError, gatewayConfigurationStatus } from './ai-gateway';
import { archiveSourceAllowed } from './supplier-media-archive';

const identity = { role: 'SYSTEM', actor: 'system:studio-production' };
/** Bounded worker: up to three independent products per cron, one image per request, at most 45 source photos per run, explicit handoff required. */
export async function runStudioProduction(correlationId: string, targetProductIds?: string[]) {
  const db = await getDatabasePool();
  const lock = await db.connect();
  const acquired = (await lock.query("SELECT pg_try_advisory_lock(hashtext('ddf:studio-production')) AS acquired")).rows[0]?.acquired;
  if (!acquired) { lock.release(); return { checked: 0, reason: 'studio_worker_busy' }; }
  try {
    const media = ((await readState('media'))?.payload ?? emptyMedia) as MediaState;
    const requests = (media.productionRequests ?? []).filter(item => !targetProductIds || targetProductIds.includes(item.productId));
    // Recovery avoids generating another paid image when a previous execution lost its checkpoint.
    for (const stale of requests.filter(item => item.status === 'PROCESSANDO' && Date.parse(item.updatedAt) < Date.now() - 12 * 60_000)) {
      await runServerCommand('media.updateProductionRequest', { requestId: stale.id, status: 'FALHOU', error: 'Execução interrompida; conferir o histórico antes de solicitar novamente.' }, { ...identity, correlationId });
    }
    const pending = requests.filter(item => item.status === 'PENDENTE').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, 3);
    if (!pending.length) return { checked: 0 };
    if (!gatewayConfigurationStatus().configured || !process.env.DDF_PUBLIC_URL) return { checked: 0, blocked: 1, reason: 'studio_configuration_missing' };
    const publicOrigin = new URL(process.env.DDF_PUBLIC_URL).origin;
    const products = ((await readState('products'))?.payload ?? emptyProductFactory) as ProductFactoryState;
    const sourceBudgetPerRequest = Math.floor(45 / pending.length);
    async function processRequest(request: MediaProductionRequest) {
    const product = products.products.find(item => item.id === request.productId && item.status === 'EM_PRODUCAO' && !item.archivedAt);
    if (!product) {
      await runServerCommand('media.updateProductionRequest', { requestId: request.id, status: 'BLOQUEADO', error: 'Produto fora da produção.' }, { ...identity, correlationId });
      return { checked: 1, blocked: 1 };
    }
    if (studioReadiness(media, product.id).ready) {
      await runServerCommand('media.updateProductionRequest', { requestId: request.id, status: 'CONCLUIDO' }, { ...identity, correlationId });
      return { checked: 1, completed: 1 };
    }
    const sources = request.sourceAssetIds.map(id => media.assets.find(item => item.id === id && item.productId === product.id && item.kind === 'ORIGINAL' && item.status === 'APROVADA')).filter(item => Boolean(item) && archiveSourceAllowed(item!.sourceUrl ?? item!.url));
    const completedAngles = new Set(approvedStudioAssets(media, product.id).map(item => item.studioAngle));
    const angle = STUDIO_ANGLES.find(item => !completedAngles.has(item));
    await runServerCommand('media.updateProductionRequest', { requestId: request.id, status: 'PROCESSANDO' }, { ...identity, correlationId });
    try {
      if (!sources.length || !angle || sources.length !== request.sourceAssetIds.length) throw new GatewayError('studio_missing_references', 'Todos os originais precisam estar disponíveis para inspeção; nenhuma foto foi ignorada.');
      const existing = request.sourceAssessment;
      const processed = new Set(existing?.angle === angle ? existing.processedSourceAssetIds : []);
      const supported = new Set(existing?.angle === angle ? existing.supportedSourceAssetIds : []);
      let variantIdentity = existing?.variantIdentity ?? '';
      const pendingSources = sources.filter(source => !processed.has(source!.id));
      for (let offset = 0; offset < Math.min(sourceBudgetPerRequest, pendingSources.length); offset += 15) {
        const batch = pendingSources.slice(offset, Math.min(offset + 15, sourceBudgetPerRequest));
        const assessment = await assessStudioSourceBatch({ productId: product.id, title: product.universalTitle, angle,
          references: batch.map(source => source!.sourceUrl ?? source!.url), variantIdentity, correlationId });
        variantIdentity = assessment.variantIdentity;
        batch.forEach(source => processed.add(source!.id));
        assessment.supportedIndices.forEach(index => supported.add(batch[index - 1]!.id));
        await runServerCommand('media.checkpointStudioAssessment', { requestId: request.id, angle, variantIdentity,
          processedSourceAssetIds: [...processed], supportedSourceAssetIds: [...supported], evidence: [assessment.evidence] }, { ...identity, correlationId });
      }
      if (sources.some(source => !processed.has(source!.id))) {
        await runServerCommand('media.updateProductionRequest', { requestId: request.id, status: 'PENDENTE' }, { ...identity, correlationId });
        return { checked: 1, inspecting: 1, inspected: processed.size, remainingSources: sources.length - processed.size };
      }
      const selectedSources = sources.filter(source => supported.has(source!.id)).slice(0, 5);
      const references = selectedSources.map(source => source!.sourceUrl ?? source!.url);
      const result = await generateReviewedStudioImage({ productId: product.id, title: product.universalTitle, angle, references, correlationId,
        variantIdentity, sourceVerified: true });
      const content = Buffer.from(result.image.base64, 'base64');
      const checksum = createHash('sha256').update(content).digest('hex');
      if (media.assets.some(asset => asset.productId === product.id && asset.checksum === checksum && asset.kind === 'DERIVADA')) throw new GatewayError('studio_duplicate_image', 'Imagem repetida: não conta como novo ângulo.');
      const id = randomUUID();
      const jpeg = result.image.mimeType === 'image/jpeg';
      await db.query('INSERT INTO media_blobs(id,filename,mime_type,bytes,checksum_sha256,content) VALUES($1,$2,$3,$4,$5,$6)', [id, `studio-${product.id}-${angle}.${jpeg ? 'jpg' : 'png'}`, result.image.mimeType, content.length, checksum, content]);
      const stored = await runServerCommand('media.recordStudioResult', { requestId: request.id, approved: result.approved,
        asset: { productId: product.id, url: `${publicOrigin}/api/media?id=${id}`, kind: 'DERIVADA', originalAssetId: selectedSources[0]!.id,
          sourceAssetIds: selectedSources.map(item => item!.id), purpose: `Estúdio ${angle}`, provenance: `Control Room ${result.image.providerId}/${result.image.modelId}`,
          transformationNotes: `Todas as ${sources.length} fotos originais inspecionadas; ${selectedSources.length} referências comprovadas da mesma variante usadas neste ângulo. Hiper-realismo 1:1 sem modelos, dimensões/formato/lentes/hastes/textura/cor/proporções preservados; revisão visual independente.`, studioAngle: angle,
          fidelityEvidence: `${result.evidence} Revisão: ${result.reviewer.providerId}/${result.reviewer.modelId}`, generationProvider: result.image.providerId, generationId: result.image.generationId,
          mimeType: result.image.mimeType, checksum, bytes: content.length, changesProductAppearance: !result.approved, rightsStatus: 'DECLARADO', format: jpeg ? 'JPEG' : 'PNG', aspectRatio: '1:1' } }, { ...identity, correlationId });
      const next = stored.payload as MediaState;
      await runServerCommand('media.updateProductionRequest', { requestId: request.id, status: result.approved ? studioReadiness(next, product.id).ready ? 'CONCLUIDO' : 'PENDENTE' : 'BLOQUEADO',
        ...(result.approved ? {} : { error: 'Revisão visual recusou a fidelidade; imagem preservada no histórico para conferência.' }) }, { ...identity, correlationId });
      return { checked: 1, generated: 1, approved: result.approved ? 1 : 0, angle };
    } catch (error) {
      const code = error instanceof GatewayError ? error.code : 'studio_execution_failed';
      await runServerCommand('media.updateProductionRequest', { requestId: request.id, status: 'FALHOU', error: `Produção não concluída (${code}); nenhuma foto foi presumida aprovada.` }, { ...identity, correlationId });
      return { checked: 1, failed: 1, code };
    }
    }
    const outcomes = await Promise.allSettled(pending.map(processRequest));
    const results = outcomes.map((outcome, index) => outcome.status === 'fulfilled'
      ? { requestId: pending[index].id, ...outcome.value }
      : { requestId: pending[index].id, checked: 1, failed: 1, code: 'studio_checkpoint_failed' });
    return { checked: results.reduce((sum, item) => sum + item.checked, 0),
      generated: results.reduce((sum, item) => sum + ('generated' in item ? Number(item.generated) : 0), 0),
      failed: results.reduce((sum, item) => sum + ('failed' in item ? Number(item.failed) : 0), 0),
      blocked: results.reduce((sum, item) => sum + ('blocked' in item ? Number(item.blocked) : 0), 0), results };
  } finally { await lock.query("SELECT pg_advisory_unlock(hashtext('ddf:studio-production'))"); lock.release(); }
}
