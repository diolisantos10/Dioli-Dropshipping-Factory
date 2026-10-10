import test from 'node:test';
import assert from 'node:assert/strict';
import { requestProductCompletion, updateCompletionRequest, dueCompletionRequests, completionRetry } from '../src/lib/product-completion-queue.ts';
import { emptyProductFactory, startProduct, refreshProductSupplier } from '../src/lib/product-factory.ts';
const at = '2026-10-10T01:00:00Z';
const base = { ...emptyProductFactory, products: [{ id: 'one', status: 'EM_PRODUCAO' }, { id: 'ready', status: 'PRONTO' }] };
test('completion request persists one active job per eligible existing master, never approves raw candidates', () => {
  let seq = 0;
  let state = requestProductCompletion(base, ['one', 'one', 'ready', 'missing'], () => `req${++seq}`, at, 'operator');
  assert.equal(state.completionRequests.length, 1);
  assert.equal(state.completionRequests[0].requestedBy, 'operator');
  assert.deepEqual(state.products, base.products);
  state = requestProductCompletion(state, ['one'], () => `req${++seq}`, at, 'operator');
  assert.equal(seq, 1);
  state = updateCompletionRequest(state, 'req1', { status: 'BLOCKED', attempts: 1, reason: 'Missing source facts' }, at);
  state = requestProductCompletion(state, ['one'], () => `req${++seq}`, at, 'operator');
  assert.equal(state.completionRequests[0].id, 'req2');
  assert.equal(state.completionRequests[0].attempts, 0);
});
test('bounded retries wait, recover expired processing jobs, then stop after five provider failures', () => {
  let state = requestProductCompletion(base, ['one'], () => 'job', at, 'operator');
  state = updateCompletionRequest(state, 'job', completionRetry(1, at, 'supplier_reconnect_required', 'Reconnect supplier'), at);
  assert.equal(dueCompletionRequests(state, at).length, 0);
  assert.equal(dueCompletionRequests(state, '2026-10-10T01:16:00Z').length, 1);
  state = updateCompletionRequest(state, 'job', { status: 'PROCESSING', attempts: 1, nextAttemptAt: undefined }, at);
  assert.equal(dueCompletionRequests(state, at).length, 1);
  state = updateCompletionRequest(state, 'job', completionRetry(5, at, 'gateway_failed', 'Provider unavailable'), at);
  assert.equal(state.completionRequests[0].status, 'FAILED');
  assert.equal(dueCompletionRequests(state, '2026-10-11T01:00:00Z').length, 0);
  assert.throws(() => requestProductCompletion(base, Array(201).fill('one'), () => 'x', at, 'op'), /200/);
});
test('an existing master can receive confirmed supplier data without changing legacy raw triage', () => {
  const candidate = { id: 'c', name: 'Óculos', notes: '', url: 'https://example.com/item', status: 'APROVADO', createdAt: at, category: 'Óculos' };
  let state = startProduct(emptyProductFactory, candidate, 'one', at);
  const legacy = { ...candidate, status: 'TRIADO', supplier: { name: 'Fornecedor', ref: '123', images: [], variants: [], description: '', materials: ['Metal'], dimensions: { lengthCm: 14, widthCm: 4, heightCm: 2 }, weightGrams: 20 } };
  state = refreshProductSupplier(state, 'one', legacy, at, 'system');
  assert.equal(state.products[0].spec.technical.weightGrams, 20);
  assert.equal(legacy.status, 'TRIADO');
  assert.equal(state.products[0].status, 'EM_PRODUCAO');
});

test('soft archive preserves existing master history and blocks only its unfinished queue', async () => {
  const { archiveProducts } = await import('../src/lib/product-factory.ts');
  const candidate = { id: 'archived-source', name: 'Produto', status: 'APROVADO', notes: '', url: 'https://example.com', createdAt: at };
  let state = startProduct(emptyProductFactory, candidate, 'one', at);
  state = requestProductCompletion(state, ['one'], () => 'job', at, 'operator');
  state = archiveProducts(state, ['one'], 'Duplicado', at, 'operator');
  assert.equal(state.products.length, 1);
  assert.equal(state.products[0].archivedAt, at);
  assert.equal(state.products[0].version, 2);
  assert.equal(state.versions.length, 2);
  assert.equal(state.completionRequests[0].code, 'product_archived');
  assert.equal(dueCompletionRequests(state, at).length, 0);
  assert.equal(requestProductCompletion(state, ['one'], () => 'new', at, 'operator').completionRequests[0].id, 'job');
  assert.throws(() => archiveProducts({ ...state, products: [{ ...state.products[0], status: 'PRONTO', archivedAt: undefined }] }, ['one'], 'Delete', at, 'operator'), /Nenhum cadastro/);
});
