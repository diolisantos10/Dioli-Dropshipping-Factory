import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateCard, categoriesOf, filterCards, NO_CATEGORY, runCardBulk } from '../src/lib/storefront.ts';

const candidate = (id, name, category, extras = {}) => ({ id, name, category, url: `https://example.com/${id}`, notes: '', status: 'CANDIDATO', createdAt: '2026-10-09', ...extras });
const supplier = { name: 'AliExpress Santioh', ref: 'ref', cost: 10, currency: 'BRL', stock: 2, imageUrl: '', images: [], variants: [{ sku: 'SUN-001', label: 'Azul', stock: 2, price: 10 }], materials: ['Acetato'], dimensions: { lengthCm: 14, widthCm: 5, heightCm: 2 }, weightGrams: 30 };

test('shared product lists filter real glasses, categories, missing data and accent-insensitive SKU search', () => {
  const cards = [candidateCard(candidate('a', 'Óculos Clássico', 'Moda', { supplier })), candidateCard(candidate('b', 'LED Light Panel', 'Iluminação', { supplier: { ...supplier, variants: [] } })), candidateCard(candidate('c', 'Estojo para óculos', 'Moda')), candidateCard(candidate('d', 'Produto novo', ''))];
  assert.deepEqual(filterCards(cards, { eyewearOnly: true }).map(card => card.id), ['a']);
  assert.deepEqual(filterCards(cards, { query: 'oculos classico', category: 'móda', missing: 'dimensions' }), []);
  assert.deepEqual(filterCards(cards, { query: 'sun-001', eyewearOnly: true }).map(card => card.id), ['a']);
  assert.deepEqual(filterCards(cards, { category: NO_CATEGORY }).map(card => card.id), ['d']);
  assert.deepEqual(filterCards(cards, { missing: 'material' }).map(card => card.id), ['c', 'd']);
  assert.deepEqual(categoriesOf(cards), ['Iluminação', 'Moda']);
  assert.equal(cards[0].url, 'https://example.com/a');
});

test('multi-SKU technical filters cannot borrow general dimensions or weight', () => {
  const card = candidateCard(candidate('a', 'Óculos', 'Moda', { supplier: { ...supplier, variants: [...supplier.variants, { sku: 'SUN-002', label: 'Verde', price: 10, stock: 2 }] } }));
  assert.equal(filterCards([card], { missing: 'dimensions' }).length, 1);
  assert.equal(filterCards([card], { missing: 'weight' }).length, 1);
});

test('bulk action includes results beyond pagination and uses sequential batches of at most 200', async () => {
  const ids = Array.from({ length: 451 }, (_, index) => `p${index}`);
  const batches = []; const progress = [];
  const text = await runCardBulk([...ids, 'p1'], 'TRIADO', 'Seleção', async (batch, state, reason) => { batches.push(batch); assert.equal(state, 'TRIADO'); assert.equal(reason, 'Seleção'); return `${batch.length} enviado(s).`; }, completed => progress.push(completed.length));
  assert.deepEqual(batches.map(batch => batch.length), [200, 200, 51]);
  assert.deepEqual(batches.flat(), ids);
  assert.deepEqual(progress, [200, 400, 451]);
  assert.match(text, /51 enviado/);
});

test('partial bulk failures stop before later batches and preserve successful progress', async () => {
  const ids = Array.from({ length: 451 }, (_, index) => String(index));
  let calls = 0; let completed = [];
  await assert.rejects(() => runCardBulk(ids, 'TRIADO', 'Seleção', async () => { calls++; if (calls === 2) throw new Error('Servidor indisponível'); return 'Ok'; }, ids => { completed = ids; }), /Servidor indisponível/);
  assert.equal(calls, 2); assert.equal(completed.length, 200);
});
