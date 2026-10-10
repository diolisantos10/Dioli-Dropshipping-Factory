import type { IntakeState } from './intake.ts';
import type { ProductFactoryState } from './product-factory.ts';
import { addMedia, reviewMedia, ingestSupplierOriginals, studioReadiness, type MediaAsset, type MediaState, type MediaProductionRequest } from './media-factory.ts';

/** A handoff is persisted work, never an approval of the product or generated images. */
export function bulkSendToMedia(state: MediaState, products: ProductFactoryState, intake: IntakeState, productIds: string[], newId: () => string, at: string, actor: string): MediaState {
  let next = state;
  let eligible = 0;
  for (const productId of new Set(productIds)) {
    const product = products.products.find(item => item.id === productId && item.status === 'EM_PRODUCAO' && !item.archivedAt);
    const candidate = intake.candidates.find(item => item.id === product?.candidateId && item.status === 'APROVADO');
    if (!product || !candidate) continue;
    eligible++;
    if (studioReadiness(next, productId).ready) continue;
    const images = [...(candidate.supplier?.images ?? []), candidate.supplier?.imageUrl ?? '', ...(product.spec?.sourceImages ?? [])].filter(Boolean);
    next = ingestSupplierOriginals(next, productId, images, candidate.url, at);
    const existing = (next.productionRequests ?? []).find(item => item.productId === productId);
    const sourceAssetIds = next.assets.filter(asset => asset.productId === productId && asset.kind === 'ORIGINAL' && asset.status === 'APROVADA').map(asset => asset.id);
    if (existing && ['PENDENTE', 'PROCESSANDO'].includes(existing.status)) {
      if (sourceAssetIds.some(id => !existing.sourceAssetIds.includes(id))) next = { ...next, productionRequests: next.productionRequests?.map(item => item.id === existing.id ? { ...item, sourceAssetIds, updatedAt: at } : item) };
      continue;
    }
    const request: MediaProductionRequest = {
      id: existing?.id ?? newId(), productId, status: sourceAssetIds.length ? 'PENDENTE' : 'BLOQUEADO',
      requestedAt: at, requestedBy: actor, updatedAt: at, sourceAssetIds, requiredCount: 4,
      sourceAssessment: existing?.sourceAssessment,
      error: sourceAssetIds.length ? undefined : 'Produto sem imagens originais do fornecedor; aguardando importação.',
    };
    next = { ...next, productionRequests: [request, ...(next.productionRequests ?? []).filter(item => item.productId !== productId)] };
  }
  if (!eligible) throw new Error('Nenhum produto em produção com origem aprovada foi selecionado.');
  return next;
}

export function updateMediaProductionRequest(state: MediaState, requestId: string, status: MediaProductionRequest['status'], at: string, error?: string): MediaState {
  const request = (state.productionRequests ?? []).find(item => item.id === requestId);
  if (!request) throw new Error('Solicitação de mídia não encontrada.');
  if (!['PENDENTE', 'PROCESSANDO', 'BLOQUEADO', 'FALHOU'].includes(request.status)) throw new Error('Solicitação de mídia já concluída.');
  if (status === 'PROCESSANDO' && request.status !== 'PENDENTE') throw new Error('Somente solicitações pendentes podem iniciar processamento.');
  if (status === 'CONCLUIDO' && !studioReadiness(state, request.productId).ready) throw new Error('Concluir mídia exige quatro fotos de estúdio aprovadas e fiéis.');
  if (['BLOQUEADO', 'FALHOU'].includes(status) && !error?.trim()) throw new Error('Informe o motivo do bloqueio ou falha.');
  return { ...state, productionRequests: (state.productionRequests ?? []).map(item => item.id === requestId ? { ...item, status, updatedAt: at, error: error?.trim() || undefined } : item) };
}

export function recordMediaProductionResult(state: MediaState, requestId: string, asset: Omit<MediaAsset, 'id' | 'status' | 'createdAt'>, approved: boolean, id: string, at: string): MediaState {
  const request = state.productionRequests?.find(item => item.id === requestId);
  if (!request || request.status !== 'PROCESSANDO') throw new Error('Solicitação de mídia não está em processamento.');
  const references = asset.sourceAssetIds?.length ? asset.sourceAssetIds : [asset.originalAssetId ?? ''];
  if (asset.productId !== request.productId || asset.kind !== 'DERIVADA' || !request.sourceAssetIds.includes(asset.originalAssetId ?? '') || references.some(reference => !request.sourceAssetIds.includes(reference))) throw new Error('Referências não pertencem à solicitação de mídia.');
  if (!asset.studioAngle?.trim() || !asset.fidelityEvidence?.trim() || !asset.generationProvider?.trim() || !asset.generationId?.trim()) throw new Error('Resultado exige ângulo, origem de geração e evidência da revisão visual.');
  if (state.assets.some(original => original.kind === 'ORIGINAL' && (original.url === asset.url || original.sourceUrl === asset.url))) throw new Error('Imagem original não pode ser apresentada como foto de estúdio gerada.');
  const next = addMedia(state, { ...asset, studio: true, fidelityVerified: approved }, id, at);
  return reviewMedia(next, id, approved ? 'APROVADA' : 'REJEITADA');
}

export function checkpointStudioAssessment(state: MediaState, requestId: string, assessment: NonNullable<MediaProductionRequest['sourceAssessment']>, at: string): MediaState {
  const request = state.productionRequests?.find(item => item.id === requestId);
  if (!request || request.status !== 'PROCESSANDO') throw new Error('Solicitação de mídia não está em processamento.');
  const processed = [...new Set(assessment.processedSourceAssetIds)];
  const supported = [...new Set(assessment.supportedSourceAssetIds)];
  if (!assessment.angle.trim() || processed.some(id => !request.sourceAssetIds.includes(id)) || supported.some(id => !processed.includes(id))) throw new Error('Análise contém referências inválidas para esta solicitação.');
  const previous = request.sourceAssessment?.angle === assessment.angle ? request.sourceAssessment : undefined;
  const priorIdentity = request.sourceAssessment?.variantIdentity ?? '';
  if (priorIdentity && assessment.variantIdentity && priorIdentity !== assessment.variantIdentity) throw new Error('Não é possível misturar variantes na mesma análise de referências.');
  const sourceAssessment = { angle: assessment.angle, variantIdentity: assessment.variantIdentity || priorIdentity, processedSourceAssetIds: [...new Set([...(previous?.processedSourceAssetIds ?? []), ...processed])], supportedSourceAssetIds: [...new Set([...(previous?.supportedSourceAssetIds ?? []), ...supported])], evidence: [...new Set([...(previous?.evidence ?? []), ...assessment.evidence])].slice(-200) };
  return { ...state, productionRequests: state.productionRequests?.map(item => item.id === requestId ? { ...item, sourceAssessment, updatedAt: at } : item) };
}
