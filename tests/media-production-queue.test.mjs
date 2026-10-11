import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStates, executeCommand, authorizeCommand } from '../src/lib/commands.ts';
import { studioReadiness } from '../src/lib/media-factory.ts';
import { canRetryStudioInspection, retryStudioInspection, STUDIO_SOURCE_SELECTION_REPAIR, STUDIO_EMPTY_VARIANT_REPAIR } from '../src/lib/media-production-queue.ts';

const at = '2026-10-10T01:00:00Z';
let serial = 0;
const context = { role: 'OPERATOR', actor: 'diego', at, newId: () => `request-${++serial}` };
function fixture() {
  const states = structuredClone(emptyStates);
  states.products.products = [{ id: 'p1', candidateId: 'c1', status: 'EM_PRODUCAO', spec: { sourceImages: [] } }, { id: 'ready', candidateId: 'c1', status: 'PRONTO' }];
  states.intake.candidates = [{ id: 'c1', status: 'APROVADO', url: 'https://www.aliexpress.com/item/1001.html', supplier: { images: ['https://img.test/front.jpg', 'https://img.test/side.jpg'] } }];
  return states;
}
function command(states, type, input, role = 'OPERATOR') {
  return executeCommand(type, states, input, { ...context, role }).payload;
}
test('audited per-photo diagnostics preserve unknown values, photo identity and earlier angles', () => {
  const states = fixture();
  states.media = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  const request = states.media.productionRequests[0];
  states.media = command(states, 'media.updateProductionRequest', { requestId: request.id, status: 'PROCESSANDO' }, 'SYSTEM');
  const row = { sourceAssetId: request.sourceAssetIds[0], sourceIndex: 1, angle: 'frontal', reviewerDecision: null,
    angleSupported: false, variantMatches: null, indexSelected: false, indicesValid: true, batchApproved: false,
    batchSupportsAngle: false, decisionScope: 'BATCH', angleScope: 'IMAGE', supported: false,
    failedConditions: ['angle', 'index'], evidence: 'Side image does not show frontal' };
  const base = { requestId: request.id, angle: 'frontal', variantIdentity: '', evidence: [], processedSourceAssetIds: [row.sourceAssetId], supportedSourceAssetIds: [] };
  states.media = command(states, 'media.checkpointStudioAssessment', { ...base, photoDiagnostics: [row] }, 'SYSTEM');
  assert.deepEqual(states.media.productionRequests[0].sourceAssessment.photoDiagnostics[0], row);
  states.media = command(states, 'media.checkpointStudioAssessment', { ...base, angle: 'lateral', photoDiagnostics: [{ ...row, angle: 'lateral' }] }, 'SYSTEM');
  assert.equal(states.media.productionRequests[0].sourceAssessment.photoDiagnostics.length, 2);
  assert.throws(() => command(states, 'media.checkpointStudioAssessment', { ...base, photoDiagnostics: [{ ...row, sourceIndex: 2 }] }, 'SYSTEM'), /referências inválidas/);
});
test('reviewed source-selection repair is SYSTEM-only, once, before generation, and preserves full old inspection history', t => {
  const oldPilot = process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID;
  process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID = '1005013226256365';
  t.after(() => { if (oldPilot === undefined) delete process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID; else process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID = oldPilot; });
  const states = fixture();
  states.intake.candidates[0].supplier.ref = '1005013226256365';
  const media = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  const request = media.productionRequests[0];
  request.status = 'FALHOU';
  request.error = 'Produção não concluída (studio_missing_references); nenhuma foto foi presumida aprovada.';
  request.sourceAssessment = { angle: 'frontal', variantIdentity: '', processedSourceAssetIds: [...request.sourceAssetIds], supportedSourceAssetIds: [], evidence: ['Histórico da inspeção original'] };
  states.media = media;
  const snapshot = structuredClone(request.sourceAssessment), originals = structuredClone(media.assets);
  const args = { requestId: request.id, revision: STUDIO_SOURCE_SELECTION_REPAIR };
  assert.throws(() => authorizeCommand('media.retryStudioInspection', args, 'OPERATOR'));
  states.intake.candidates[0].supplier.ref = 'different-product';
  assert.throws(() => command(states, 'media.retryStudioInspection', args, 'SYSTEM'), /somente ao produto do piloto/);
  states.intake.candidates[0].supplier.ref = '1005013226256365';
  const repaired = command(states, 'media.retryStudioInspection', args, 'SYSTEM');
  assert.equal(repaired.productionRequests[0].status, 'PENDENTE');
  assert.equal(repaired.productionRequests[0].sourceAssessment, undefined);
  assert.deepEqual(repaired.productionRequests[0].inspectionRetryHistory[0].assessment, snapshot);
  assert.equal(repaired.productionRequests[0].inspectionRetryHistory[0].revision, STUDIO_SOURCE_SELECTION_REPAIR);
  assert.deepEqual(repaired.assets, originals);
  assert.deepEqual(request.sourceAssessment, snapshot, 'old state is not mutated');
  assert.equal(canRetryStudioInspection(repaired, request.id, STUDIO_SOURCE_SELECTION_REPAIR), false);
  states.media = repaired;
  const resent = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  assert.deepEqual(resent.productionRequests[0].inspectionRetryHistory, repaired.productionRequests[0].inspectionRetryHistory);
  for (const mutate of [
    value => { value.productionRequests[0].status = 'BLOQUEADO'; },
    value => { value.productionRequests[0].sourceAssessment.supportedSourceAssetIds = [request.sourceAssetIds[0]]; },
    value => { value.productionRequests[0].sourceAssessment.variantIdentity = 'preto'; },
    value => { value.productionRequests[0].sourceAssessment.processedSourceAssetIds = []; },
    value => { value.productionRequests[0].error = 'Produção não concluída (studio_unsupported_view); nenhuma foto foi presumida aprovada.'; },
    value => { value.assets.push({ id: 'generated', productId: 'p1', kind: 'DERIVADA', studio: true, status: 'REJEITADA' }); },
    value => { value.assets[0].status = 'REJEITADA'; },
  ]) {
    const bad = structuredClone(media); mutate(bad);
    assert.equal(canRetryStudioInspection(bad, request.id, STUDIO_SOURCE_SELECTION_REPAIR), false);
    assert.throws(() => retryStudioInspection(bad, request.id, STUDIO_SOURCE_SELECTION_REPAIR, at, 'system:repair'));
  }
  assert.equal(canRetryStudioInspection(media, request.id, 'different-revision'), false);
});
test('empty-identity repair requires the exact prior reviewed inspection, retains both histories and never retries generated work', () => {
  const states = fixture();
  const initial = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  const request = initial.productionRequests[0];
  request.status = 'FALHOU';
  request.error = 'Produção não concluída (studio_missing_references); nenhuma foto foi presumida aprovada.';
  request.sourceAssessment = { angle: 'frontal', variantIdentity: '', processedSourceAssetIds: [...request.sourceAssetIds], supportedSourceAssetIds: [], evidence: ['First inspection'] };
  const inspected = retryStudioInspection(initial, request.id, STUDIO_SOURCE_SELECTION_REPAIR, at, 'system:repair');
  const current = inspected.productionRequests[0];
  current.status = 'FALHOU';
  current.error = 'Produção não concluída (studio_unsupported_view); nenhuma foto foi presumida aprovada.';
  current.sourceAssessment = { ...structuredClone(request.sourceAssessment), evidence: ['Second inspection'] };
  assert.equal(canRetryStudioInspection(inspected, request.id, STUDIO_EMPTY_VARIANT_REPAIR), true);
  for (const mutate of [
    value => { value.productionRequests[0].inspectionRetryHistory = []; },
    value => { value.productionRequests[0].inspectionRetryHistory[0].revision = 'unreviewed'; },
    value => { value.productionRequests[0].sourceAssessment.supportedSourceAssetIds = [request.sourceAssetIds[0]]; },
    value => { value.assets.push({ id: 'attempted', productId: 'p1', kind: 'DERIVADA', studio: true, status: 'REJEITADA' }); },
    value => { value.productionRequests[0].error = 'Produção não concluída (gateway_provider_timeout); nenhuma foto foi presumida aprovada.'; },
  ]) {
    const bad = structuredClone(inspected); mutate(bad);
    assert.equal(canRetryStudioInspection(bad, request.id, STUDIO_EMPTY_VARIANT_REPAIR), false);
  }
  const repaired = retryStudioInspection(inspected, request.id, STUDIO_EMPTY_VARIANT_REPAIR, at, 'system:repair');
  assert.equal(repaired.productionRequests[0].inspectionRetryHistory.length, 2);
  assert.deepEqual(repaired.productionRequests[0].inspectionRetryHistory[0].assessment, request.sourceAssessment);
  assert.deepEqual(repaired.productionRequests[0].inspectionRetryHistory[1].assessment, current.sourceAssessment);
  assert.equal(canRetryStudioInspection(repaired, request.id, STUDIO_EMPTY_VARIANT_REPAIR), false);
});
test('envio em massa usa originais persistidos e não aprova cadastro nem imagens de estúdio', () => {
  const states = fixture();
  const media = command(states, 'media.bulkSendToMedia', { productIds: ['p1', 'ready', 'missing', 'p1'], sourceImages: ['https://fake.test/attacker.jpg'] });
  assert.equal(media.productionRequests.length, 1);
  assert.equal(media.productionRequests[0].status, 'PENDENTE');
  assert.equal(media.productionRequests[0].requestedBy, 'diego');
  assert.equal(media.productionRequests[0].sourceAssetIds.length, 2);
  assert.equal(media.assets.length, 2);
  assert.ok(media.assets.every(asset => asset.kind === 'ORIGINAL' && asset.status === 'APROVADA'));
  assert.equal(studioReadiness(media, 'p1').ready, false);
  assert.equal(states.products.products[0].status, 'EM_PRODUCAO');
  const again = command({ ...states, media }, 'media.bulkSendToMedia', { productIds: ['p1'] });
  assert.deepEqual(again, media);
});
test('falta de originais bloqueia e uma importação posterior permite reenfileirar sem duplicar', () => {
  const states = fixture();
  states.intake.candidates[0].supplier.images = [];
  let media = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  assert.equal(media.productionRequests[0].status, 'BLOQUEADO');
  const id = media.productionRequests[0].id;
  states.intake.candidates[0].supplier.images = ['https://img.test/front.jpg'];
  media = command({ ...states, media }, 'media.bulkSendToMedia', { productIds: ['p1'] });
  assert.equal(media.productionRequests.length, 1);
  assert.equal(media.productionRequests[0].id, id);
  assert.equal(media.productionRequests[0].status, 'PENDENTE');
});
test('comando de atualização da fila é exclusivo do sistema e conclusão exige fotos realmente aprovadas', () => {
  const states = fixture();
  states.media = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  const requestId = states.media.productionRequests[0].id;
  assert.throws(() => authorizeCommand('media.updateProductionRequest', {}, 'ADMIN'), /papel/);
  assert.throws(() => command(states, 'media.updateProductionRequest', { requestId, status: 'CONCLUIDO' }, 'SYSTEM'), /quatro fotos/);
  assert.throws(() => command(states, 'media.updateProductionRequest', { requestId, status: 'FALHOU' }, 'SYSTEM'), /motivo/);
  const processing = command(states, 'media.updateProductionRequest', { requestId, status: 'PROCESSANDO' }, 'SYSTEM');
  assert.equal(processing.productionRequests[0].status, 'PROCESSANDO');
});
test('envio recusa seleção sem elegíveis, lote enorme e usuário sem permissão', () => {
  const states = fixture();
  assert.throws(() => command(states, 'media.bulkSendToMedia', { productIds: ['ready'] }), /Nenhum produto/);
  assert.throws(() => command(states, 'media.bulkSendToMedia', { productIds: Array(201).fill('p1') }), /Lista inválida/);
  assert.throws(() => command(states, 'media.bulkSendToMedia', { productIds: ['p1'] }, 'VIEWER'), /papel/);
});
test('análise retomável percorre a galeria inteira e não mistura identidade de variantes', () => {
  const states = fixture();
  states.intake.candidates[0].supplier.images = Array.from({ length: 31 }, (_, index) => `https://img.test/gallery-${index}.jpg`);
  states.media = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  const request = states.media.productionRequests[0];
  assert.equal(request.sourceAssetIds.length, 31);
  states.media = command(states, 'media.updateProductionRequest', { requestId: request.id, status: 'PROCESSANDO' }, 'SYSTEM');
  const base = { requestId: request.id, angle: 'frente', variantIdentity: 'SKU preto', evidence: ['Armação preta confirmada'] };
  states.media = command(states, 'media.checkpointStudioAssessment', { ...base, processedSourceAssetIds: request.sourceAssetIds.slice(0, 15), supportedSourceAssetIds: [request.sourceAssetIds[0]] }, 'SYSTEM');
  states.media = command(states, 'media.checkpointStudioAssessment', { ...base, processedSourceAssetIds: request.sourceAssetIds.slice(15), supportedSourceAssetIds: [request.sourceAssetIds[30]] }, 'SYSTEM');
  const assessment = states.media.productionRequests[0].sourceAssessment;
  assert.equal(assessment.processedSourceAssetIds.length, 31);
  assert.deepEqual(assessment.supportedSourceAssetIds, [request.sourceAssetIds[0], request.sourceAssetIds[30]]);
  assert.throws(() => command(states, 'media.checkpointStudioAssessment', { ...base, variantIdentity: 'SKU dourado', processedSourceAssetIds: [], supportedSourceAssetIds: [] }, 'SYSTEM'), /misturar variantes/);
  assert.throws(() => command(states, 'media.checkpointStudioAssessment', { ...base, processedSourceAssetIds: [], supportedSourceAssetIds: ['outro-produto'] }, 'SYSTEM'), /referências inválidas/);
  states.intake.candidates[0].supplier.images.push('https://img.test/new-original.jpg');
  states.media = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  assert.equal(states.media.productionRequests[0].sourceAssetIds.length, 32);
  assert.equal(states.media.productionRequests[0].sourceAssessment.processedSourceAssetIds.length, 31);
});
test('remoção comercial preserva originais e registra responsável; operador não remove imagens aprovadas', () => {
  const states = fixture();
  states.media = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  const originalId = states.media.assets[0].id;
  states.media.assets.push({ id: 'commercial', productId: 'p1', kind: 'DERIVADA', status: 'APROVADA', url: 'https://img.test/studio.png' });
  assert.throws(() => command(states, 'media.bulkRemoveCommercialAssets', { assetIds: ['commercial'], reason: 'Remover do catálogo' }), /papel/);
  const media = command(states, 'media.bulkRemoveCommercialAssets', { assetIds: ['commercial', originalId], reason: 'Foto desatualizada' }, 'APPROVER');
  const removed = media.assets.find(asset => asset.id === 'commercial');
  assert.equal(removed.status, 'REJEITADA');
  assert.equal(removed.removedBy, 'diego');
  assert.equal(removed.removedAt, at);
  assert.equal(removed.removalReason, 'Foto desatualizada');
  assert.equal(media.assets.find(asset => asset.id === originalId).status, 'APROVADA');
  assert.equal(media.assets.length, states.media.assets.length);
});
test('resultado de estúdio exige solicitação ativa e referências corretas; revisão reprovada permanece fora do catálogo', () => {
  const states = fixture();
  states.media = command(states, 'media.bulkSendToMedia', { productIds: ['p1'] });
  const requestId = states.media.productionRequests[0].id;
  const originalAssetId = states.media.productionRequests[0].sourceAssetIds[0];
  const asset = { productId: 'p1', url: 'https://img.test/generated.png', kind: 'DERIVADA', originalAssetId, purpose: 'Estúdio frente', provenance: 'Gateway central', transformationNotes: 'Fundo neutro', studioAngle: 'frente', fidelityEvidence: 'Forma e cor comparadas às referências', generationProvider: 'openai', generationId: 'generation-1', sourceAssetIds: [originalAssetId] };
  assert.throws(() => command(states, 'media.recordStudioResult', { requestId, approved: true, asset }, 'SYSTEM'), /processamento/);
  states.media = command(states, 'media.updateProductionRequest', { requestId, status: 'PROCESSANDO' }, 'SYSTEM');
  assert.throws(() => command(states, 'media.recordStudioResult', { requestId, approved: true, asset: { ...asset, sourceAssetIds: ['other-product'] } }, 'SYSTEM'), /Referências/);
  assert.throws(() => command(states, 'media.recordStudioResult', { requestId, approved: true, asset: { ...asset, url: states.media.assets[0].url } }, 'SYSTEM'), /original/);
  assert.throws(() => command(states, 'media.recordStudioResult', { requestId, approved: true, asset: { ...asset, changesProductAppearance: true } }, 'SYSTEM'), /enganosa/);
  const rejected = command(states, 'media.recordStudioResult', { requestId, approved: false, asset }, 'SYSTEM');
  assert.equal(rejected.assets[0].status, 'REJEITADA');
  assert.equal(studioReadiness(rejected, 'p1').approvedCount, 0);
  const accepted = command(states, 'media.recordStudioResult', { requestId, approved: true, asset }, 'SYSTEM');
  assert.equal(accepted.assets[0].status, 'APROVADA');
  assert.equal(accepted.assets[0].fidelityVerified, true);
  assert.equal(studioReadiness(accepted, 'p1').ready, false);
});
