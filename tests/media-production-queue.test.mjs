import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStates, executeCommand, authorizeCommand } from '../src/lib/commands.ts';
import { studioReadiness } from '../src/lib/media-factory.ts';

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
