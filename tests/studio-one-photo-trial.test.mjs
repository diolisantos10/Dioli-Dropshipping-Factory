import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeSinglePhotoTrial, SINGLE_PHOTO_TRIAL_REVISION } from '../src/lib/studio-one-photo-trial.ts';
const rejection = 'Revisão visual recusou a fidelidade; imagem preservada no histórico para conferência.';
function fixture() {
  return { version: 2, assets: [{ id: 'old-output', productId: 'pilot', kind: 'DERIVADA', studio: true, status: 'REJEITADA' },
    { id: 'unrelated', productId: 'other', kind: 'DERIVADA', studio: true, status: 'APROVADA' }],
    productionRequests: [{ id: 'request', productId: 'pilot', status: 'BLOQUEADO', error: rejection, sourceAssetIds: ['source'],
      sourceAssessment: { angle: 'frontal', variantIdentity: 'preto', processedSourceAssetIds: ['source'], supportedSourceAssetIds: ['source'], evidence: ['frontal comprovado'] } },
    { id: 'other-request', productId: 'other', status: 'BLOQUEADO', error: 'unchanged' }] };
}
test('one explicit image trial preserves previous fidelity failures and unrelated products; authorization cannot be reused', () => {
  const before = fixture(); const snapshot = structuredClone(before);
  const next = authorizeSinglePhotoTrial(before, 'request', SINGLE_PHOTO_TRIAL_REVISION, '2026-10-12T04:15:00Z', 'system:factory-pilot:user-authorized');
  assert.deepEqual(before, snapshot);
  assert.deepEqual(next.assets, before.assets);
  assert.deepEqual(next.productionRequests[1], before.productionRequests[1]);
  const request = next.productionRequests[0];
  assert.equal(request.status, 'PENDENTE');
  assert.equal(request.sourceAssessment.variantIdentity, 'preto');
  assert.equal(request.singlePhotoTrialHistory[0].previousError, rejection);
  assert.deepEqual(request.singlePhotoTrialHistory[0].previousDerivedAssetIds, ['old-output']);
  request.status = 'BLOQUEADO'; request.error = rejection;
  assert.throws(() => authorizeSinglePhotoTrial(next, 'request', SINGLE_PHOTO_TRIAL_REVISION, 'later', 'system'), /consumido/);
});
test('source, billing, interruption and approved-image states cannot be reopened by one-photo authorization', () => {
  for (const error of ['Produção não concluída (gateway_provider_budget_exceeded); nenhuma foto foi presumida aprovada.', 'Execução interrompida', 'studio_unsupported_view']) {
    const state = fixture(); state.productionRequests[0].error = error;
    assert.throws(() => authorizeSinglePhotoTrial(state, 'request', SINGLE_PHOTO_TRIAL_REVISION, 'now', 'system'), /elegível/);
  }
  const approved = fixture(); approved.assets[0].status = 'APROVADA';
  assert.throws(() => authorizeSinglePhotoTrial(approved, 'request', SINGLE_PHOTO_TRIAL_REVISION, 'now', 'system'), /rejeitados/);
  const unknown = fixture(); unknown.productionRequests[0].sourceAssessment.supportedSourceAssetIds = [];
  assert.throws(() => authorizeSinglePhotoTrial(unknown, 'request', SINGLE_PHOTO_TRIAL_REVISION, 'now', 'system'), /elegível/);
});
