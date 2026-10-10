import type { ProductFactoryState } from './product-factory.ts';

export type CompletionStatus = 'PENDING' | 'PROCESSING' | 'CONTINUING' | 'COMPLETED' | 'BLOCKED' | 'FAILED';
export type ProductCompletionRequest = {
  id: string; productId: string; requestedAt: string; requestedBy: string; updatedAt: string;
  status: CompletionStatus; attempts: number; code?: string; reason?: string; nextAttemptAt?: string;
};
const active = new Set<CompletionStatus>(['PENDING', 'PROCESSING', 'CONTINUING']);
export function requestProductCompletion(state: ProductFactoryState, productIds: string[], newId: () => string, at: string, actor: string): ProductFactoryState {
  if (!productIds.length || productIds.length > 200) throw new Error('Selecione entre 1 e 200 cadastros.');
  const requests = [...(state.completionRequests ?? [])];
  for (const productId of new Set(productIds)) {
    if (!state.products.some(product => product.id === productId && product.status !== 'PRONTO' && !product.archivedAt)) continue;
    if (requests.some(request => request.productId === productId && active.has(request.status))) continue;
    // Keep one visible request per product; retrying a blocked request starts a new bounded cycle.
    const previous = requests.findIndex(request => request.productId === productId);
    const request: ProductCompletionRequest = { id: newId(), productId, requestedAt: at, requestedBy: actor, updatedAt: at, status: 'PENDING', attempts: 0 };
    if (previous >= 0) requests[previous] = request; else requests.push(request);
  }
  return { ...state, completionRequests: requests };
}
export function updateCompletionRequest(state: ProductFactoryState, requestId: string, input: Pick<ProductCompletionRequest, 'status' | 'attempts'> & Partial<Pick<ProductCompletionRequest, 'code' | 'reason' | 'nextAttemptAt'>>, at: string): ProductFactoryState {
  if (!state.completionRequests?.some(request => request.id === requestId)) throw new Error('Solicitação de cadastro não encontrada.');
  return { ...state, completionRequests: state.completionRequests.map(request => request.id === requestId ? { ...request, ...input, updatedAt: at } : request) };
}
export function dueCompletionRequests(state: ProductFactoryState, now: string): ProductCompletionRequest[] {
  return (state.completionRequests ?? []).filter(request => active.has(request.status) && state.products.some(product => product.id === request.productId && !product.archivedAt) && (!request.nextAttemptAt || Date.parse(request.nextAttemptAt) <= Date.parse(now)))
    .sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
}
export function completionRetry(attempts: number, at: string, code: string, reason: string) {
  return attempts >= 5 ? { status: 'FAILED' as const, attempts, code, reason } : {
    status: 'CONTINUING' as const, attempts, code, reason,
    nextAttemptAt: new Date(Date.parse(at) + Math.min(240, 15 * 2 ** (attempts - 1)) * 60_000).toISOString(),
  };
}
