import type { MediaState } from './media-factory.ts';
export const SINGLE_PHOTO_TRIAL_REVISION = 'pilot-one-photo-trial-20261012-011020';
/** The CEO explicitly authorized ONE new image on 12 Oct. Preserve every rejected asset and prior review. */
export function authorizeSinglePhotoTrial(state: MediaState, requestId: string, revision: string, at: string, actor: string): MediaState {
  const request = state.productionRequests?.find(item => item.id === requestId);
  if (!request || revision !== SINGLE_PHOTO_TRIAL_REVISION || request.status !== 'BLOQUEADO'
    || request.error !== 'Revisão visual recusou a fidelidade; imagem preservada no histórico para conferência.'
    || request.sourceAssetIds.length > 5 || !request.sourceAssessment?.variantIdentity?.trim()
    || !request.sourceAssessment.supportedSourceAssetIds.length
    || request.sourceAssetIds.some(id => !request.sourceAssessment!.processedSourceAssetIds.includes(id))
    || request.singlePhotoTrialHistory?.some(item => item.revision === revision)) throw new Error('Teste de uma foto não elegível ou já consumido.');
  const existing = state.assets.filter(item => item.productId === request.productId && item.studio === true && item.kind === 'DERIVADA');
  if (!existing.length || existing.some(item => item.status !== 'REJEITADA')) throw new Error('Teste exige somente resultados anteriores rejeitados, preservados.');
  return { ...state, productionRequests: state.productionRequests?.map(item => item.id === requestId ? {
    ...item, status: 'PENDENTE', updatedAt: at, error: undefined,
    singlePhotoTrialHistory: [...(item.singlePhotoTrialHistory ?? []), { revision, at, actor, previousStatus: item.status, previousError: item.error!,
      previousAssessment: structuredClone(item.sourceAssessment!), previousDerivedAssetIds: existing.map(asset => asset.id) }],
  } : item) };
}
