import test from 'node:test';
import assert from 'node:assert/strict';
import { fiscalCompletion, fiscalGaps, isValidGtin, normalizeFiscal, normalizeVariantLogistics } from '../src/lib/product-fiscal.ts';
import { setProductAvailability, updateProductFiscal } from '../src/lib/product-factory.ts';
import { executeCommand, emptyStates } from '../src/lib/commands.ts';
import { filterCards, NO_AVAILABILITY, productCard } from '../src/lib/storefront.ts';
import { catalogRecords, emptyCatalog } from '../src/lib/catalog.ts';

const variant = { id: 'v1', sku: 'MOC-01', title: 'Preta', gtin: '', attributes: {}, dimensions: { lengthCm: null, widthCm: null, heightCm: null }, weightGrams: null };
const product = (extra = {}) => ({ id: 'p1', candidateId: 'c1', status: 'PRONTO', version: 3, universalTitle: 'Mochila', shortDescription: '', longDescription: '', category: '', bullets: [], benefits: [], tags: [], spec: { variants: [variant], materials: [], colors: [], sizes: [], seo: { title: '', description: '' }, compliance: { notes: '', certifications: [] }, localizations: {}, destinationGaps: {} }, createdAt: 'x', updatedAt: 'x', ...extra });
const world = (extra) => ({ version: 1, products: [product(extra)], events: [], versions: [] });

test('GTIN valida dígito verificador (8, 12, 13, 14)', () => {
  assert.equal(isValidGtin('7891000315507'), true);
  assert.equal(isValidGtin('789-1000-315507'), true);
  assert.equal(isValidGtin('7891000315508'), false);
  assert.equal(isValidGtin('96385074'), true);
  assert.equal(isValidGtin('036000291452'), true);
  assert.equal(isValidGtin('123'), false);
});

test('tudo é opcional: vazio nunca trava, mas valor informado precisa estar no formato', () => {
  assert.deepEqual(normalizeFiscal({}), { ncm: '', cest: '', origin: '', unit: '', brand: '', model: '', warranty: '' });
  assert.equal(normalizeFiscal({ ncm: '4202.92.00', cest: '28.059.00', origin: '2', unit: 'un' }).ncm, '42029200');
  assert.equal(normalizeFiscal({ unit: 'un' }).unit, 'UN');
  assert.throws(() => normalizeFiscal({ ncm: '4202' }), /8 dígitos/);
  assert.throws(() => normalizeFiscal({ cest: '12' }), /7 dígitos/);
  assert.throws(() => normalizeFiscal({ origin: '9' }), /0 a 8/);
  assert.throws(() => normalizeFiscal({ unit: 'BALDE' }), /Unidade/);
  assert.deepEqual(normalizeVariantLogistics({ id: 'v1' }), { id: 'v1', gtin: '', weightGrams: null, dimensions: { lengthCm: null, widthCm: null, heightCm: null } });
  assert.throws(() => normalizeVariantLogistics({ id: 'v1', gtin: '7891000315508' }), /GTIN inválido/);
  assert.throws(() => normalizeVariantLogistics({ id: 'v1', weightGrams: -1 }), /Peso/);
});

test('dados fiscais e logística por variação são editáveis mesmo com produto PRONTO e geram versão', () => {
  const next = updateProductFiscal(world(), 'p1', { fiscal: { ncm: '42029200', origin: '2', unit: 'UN', brand: 'Santioh' }, variants: [{ id: 'v1', gtin: '7891000315507', weightGrams: '850', dimensions: { lengthCm: 40, widthCm: '30', heightCm: 15 } }] }, '2026-10-04T12:00:00Z', 'dioli');
  const saved = next.products[0];
  assert.equal(saved.status, 'PRONTO'); assert.equal(saved.version, 4);
  assert.equal(saved.fiscal.brand, 'Santioh');
  assert.deepEqual([saved.spec.variants[0].gtin, saved.spec.variants[0].weightGrams, saved.spec.variants[0].dimensions.widthCm], ['7891000315507', 850, 30]);
  assert.equal(next.events[0].action, 'DADOS_FISCAIS_ATUALIZADOS'); assert.equal(next.versions[0].version, 4);
  assert.throws(() => updateProductFiscal(world(), 'p1', { fiscal: {}, variants: [{ id: 'nao-existe' }] }, 'x'), /não existe/);
  assert.deepEqual(fiscalGaps(next.products[0]), ['Disponibilidade (pronta entrega / sob encomenda)']);
});

test('selo pronta entrega / sob encomenda versiona só quando muda', () => {
  let state = setProductAvailability(world(), 'p1', 'PRONTA_ENTREGA', 't1', 'dioli');
  assert.equal(state.products[0].availability, 'PRONTA_ENTREGA'); assert.equal(state.events[0].action, 'DISPONIBILIDADE_ALTERADA');
  assert.equal(setProductAvailability(state, 'p1', 'PRONTA_ENTREGA', 't2'), state);
  state = setProductAvailability(state, 'p1', 'SOB_ENCOMENDA', 't3');
  assert.equal(state.products[0].availability, 'SOB_ENCOMENDA');
  assert.throws(() => setProductAvailability(state, 'p1', 'ESTOQUE', 't4'), /inválida/);
});

test('lacunas fiscais aparecem como lista, nunca como bloqueio', () => {
  const gaps = fiscalGaps(product());
  assert.ok(gaps.includes('NCM') && gaps.includes('GTIN · Preta') && gaps.includes('Dimensões · Preta'));
  assert.equal(fiscalCompletion(product()), 0);
});

test('comandos: operador marca disponibilidade e fiscal; entrada inválida é recusada', () => {
  const states = { ...structuredClone(emptyStates), products: world() };
  const ctx = { role: 'OPERATOR', actor: 'ana', at: '2026-10-04T12:00:00Z', newId: () => 'id' };
  const a = executeCommand('products.setAvailability', states, { productId: 'p1', availability: 'SOB_ENCOMENDA' }, ctx);
  assert.equal(a.payload.products[0].availability, 'SOB_ENCOMENDA');
  const f = executeCommand('products.updateFiscal', states, { productId: 'p1', fiscal: { ncm: '', brand: 'Dilix' }, variants: [] }, ctx);
  assert.equal(f.payload.products[0].fiscal.brand, 'Dilix');
  assert.throws(() => executeCommand('products.updateFiscal', states, { productId: 'p1', fiscal: { ncm: '1' } }, ctx), /8 dígitos/);
  assert.throws(() => executeCommand('products.setAvailability', states, { productId: 'p1', availability: 'X' }, ctx), /Valor inválido/);
  assert.throws(() => executeCommand('products.setAvailability', states, { productId: 'p1', availability: 'SOB_ENCOMENDA' }, { ...ctx, role: 'VIEWER' }), /papel/);
});

test('vitrine de Disponíveis mostra o selo e filtra por disponibilidade', () => {
  const products = [product({ availability: 'PRONTA_ENTREGA' }), product({ id: 'p2', availability: 'SOB_ENCOMENDA' }), product({ id: 'p3' })];
  const cards = catalogRecords(emptyCatalog, products, [], [], []).map((record) => productCard(record));
  assert.equal(cards[0].availability, 'PRONTA_ENTREGA');
  assert.deepEqual(filterCards(cards, { availability: 'SOB_ENCOMENDA' }).map((card) => card.id), ['p2']);
  assert.deepEqual(filterCards(cards, { availability: NO_AVAILABILITY }).map((card) => card.id), ['p3']);
  assert.equal(filterCards(cards, {}).length, 3);
});
