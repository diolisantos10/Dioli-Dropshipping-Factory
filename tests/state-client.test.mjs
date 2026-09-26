import test from 'node:test';
import assert from 'node:assert/strict';
import { CACHE_KEYS, fetchStates, normalizeState, readCache, StateLoadError, writeCache } from '../src/lib/state-client.ts';
import { catalogRecords } from '../src/lib/catalog.ts';

const readyProduct = (index) => ({ id: `p${index}`, candidateId: `c${index}`, status: 'PRONTO', version: 3, universalTitle: `Produto ${index}`, shortDescription: 's', longDescription: 'l', category: 'Casa', bullets: [], benefits: [], tags: [], createdAt: 'now', updatedAt: 'now' });
const server = (payloads, failing = []) => async (url) => {
  const namespace = url.split('/').pop();
  if (failing.includes(namespace)) return new Response('{"error":"x"}', { status: 503 });
  return Response.json({ payload: payloads[namespace] ?? null, revision: 1 });
};

test('bug /disponiveis: 148 produtos PRONTO do servidor aparecem mesmo com mídia versão 2', async () => {
  const products = { version: 1, products: Array.from({ length: 148 }, (_, index) => readyProduct(index)), events: [] };
  const states = await fetchStates(['products', 'media', 'pricing', 'catalog'], server({ products, media: { version: 2, assets: [], jobs: [] } }));
  const records = catalogRecords(states.catalog, states.products.products, states.media.assets, states.pricing.calculations, states.products.events);
  assert.equal(records.length, 148);
});

test('namespace vazio no servidor vira estado vazio, sem erro', async () => {
  const states = await fetchStates(['catalog', 'pricing'], server({}));
  assert.deepEqual(states.pricing.calculations, []);
  assert.ok(states.catalog.brands.length > 0);
});

test('falha do servidor é reportada com os namespaces afetados', async () => {
  await assert.rejects(fetchStates(['products', 'media'], server({}, ['media'])), (error) => error instanceof StateLoadError && error.failed.join() === 'media');
});

test('payload com formato errado é recusado; campos novos opcionais são aceitos', () => {
  assert.equal(normalizeState('products', { version: 1, products: 'x' }), null);
  assert.equal(normalizeState('products', 'lixo'), null);
  assert.deepEqual(normalizeState('catalog', { version: 1, brands: [], stores: [], offers: [], assignments: [] }).offers, []);
  assert.deepEqual(normalizeState('media', { version: 2, assets: [] }).assets, []);
});

test('localStorage é só cache opcional: corrompido, ausente ou cheio nunca quebra', () => {
  const memory = new Map();
  const store = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.equal(readCache(['products'], store), null);
  memory.set(CACHE_KEYS.products, '{corrompido');
  assert.equal(readCache(['products'], store), null);
  writeCache('products', { version: 1, products: [readyProduct(1)], events: [] }, store);
  assert.equal(readCache(['products'], store).products.products.length, 1);
  const full = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.doesNotThrow(() => writeCache('products', {}, full));
  assert.equal(readCache(['products'], full), null);
  assert.equal(readCache(['products'], undefined), null);
});
