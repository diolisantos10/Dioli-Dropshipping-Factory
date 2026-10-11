import test from 'node:test';
import assert from 'node:assert/strict';
import { repairStoredVariantSchemas, storedVariantDiagnostic } from '../src/lib/stored-variant-repair.ts';
import { emptyProductFactory, startProduct, refreshProductSupplier, reconcileStoredProductVariants } from '../src/lib/product-factory.ts';
const variant = (sku, attributes = {}) => ({ sku, label: sku, attributes, price: 5, stock: null });
const candidate = { id: 'c', name: 'Óculos', url: 'https://www.aliexpress.com/item/1005013226256365.html', notes: '', status: 'APROVADO', createdAt: 'now', supplier: { name: 'AliExpress', ref: '1005013226256365', cost: 5, currency: 'BRL', stock: null, imageUrl: '', images: [], variants: [variant('black', { Cor: 'Preto', Lente: 'PC' }), variant('brown', { Cor: 'Marrom' })] } };
test('repair restores missing recorded variants, preserves human attributes and is idempotent', async () => {
  let products = startProduct(emptyProductFactory, candidate, 'p', 'now');
  products.products[0].spec.variants = [{ ...products.products[0].spec.variants[0], id: 'human-id', attributes: { Cor: 'Preto revisado', Curadoria: 'Manter' } }];
  const before = structuredClone(products);
  const first = await repairStoredVariantSchemas({ candidates: [candidate] }, products, async id => { products = refreshProductSupplier(products, id, candidate, 'later', 'system:stored-variant-repair'); });
  assert.equal(first.repaired, 1);
  assert.equal(products.products[0].spec.variants.length, 2);
  assert.equal(products.products[0].spec.variants[0].id, 'human-id');
  assert.deepEqual(products.products[0].spec.variants[0].attributes, { Cor: 'Preto revisado', Lente: 'PC', Curadoria: 'Manter' });
  assert.equal(products.versions.length, before.versions.length + 1);
  const second = await repairStoredVariantSchemas({ candidates: [candidate] }, products, async () => assert.fail('repeat write'));
  assert.equal(second.repaired, 0);
});
test('missing origins, ambiguous SKUs and archived products are never changed or invented', async () => {
  const ready = startProduct(emptyProductFactory, candidate, 'p', 'now'); ready.products[0].status = 'PRONTO'; ready.products[0].spec.variants = [];
  const readyPreview = reconcileStoredProductVariants(ready, [candidate], ['p'], 'later', 'system:stored-variant-repair');
  assert.equal(readyPreview.products[0].spec.variants.length, 2); assert.equal(readyPreview.products[0].status, 'EM_PRODUCAO');
  assert.equal(ready.products[0].status, 'PRONTO');
  ready.products[0].status = 'EM_PRODUCAO'; ready.products[0].archivedAt = 'now';
  assert.equal((await repairStoredVariantSchemas({ candidates: [candidate] }, ready, async () => assert.fail('archived'))).repaired, 0);
  delete ready.products[0].archivedAt;
  const duplicate = structuredClone(candidate); duplicate.supplier.variants[1].sku = 'black';
  assert.equal((await repairStoredVariantSchemas({ candidates: [duplicate] }, ready, async () => assert.fail('duplicate'))).repaired, 0);
  const legacy = { ...candidate, supplier: undefined };
  const result = await repairStoredVariantSchemas({ candidates: [legacy] }, ready, async () => assert.fail('invented'));
  assert.equal(result.candidatesWithoutStructuredSupplier, 1); assert.equal(result.candidatesWithoutRecordedVariants, 1);
});

test('older partial master schemas recover stored variants without crashing', async () => {
  let products = startProduct(emptyProductFactory, candidate, 'p', 'now');
  products.products[0].spec = { variants: [] };
  const result = await repairStoredVariantSchemas({ candidates: [candidate] }, products, async id => { products = refreshProductSupplier(products, id, candidate, 'later', 'system:stored-variant-repair'); });
  assert.equal(result.repaired, 1); assert.equal(products.products[0].spec.variants.length, 2);
  assert.deepEqual(products.products[0].spec.materials, []);
});

test('diagnostics distinguish archived, ready, active and orphan masters without exporting private data', () => {
  const product = startProduct(emptyProductFactory, candidate, 'p', 'now').products[0];
  product.spec.variants = [];
  const report = storedVariantDiagnostic({ candidates: [candidate] }, { products: [product, { ...product, id: 'archived', archivedAt: 'now' }, { ...product, id: 'ready', status: 'PRONTO' }, { ...product, id: 'orphan', candidateId: 'missing', spec: { variants: [], sourceUrl: candidate.url } }] });
  assert.equal(report.archivedMissingVariants, 1); assert.equal(report.readyMissingVariants, 1); assert.equal(report.activeDraftMissingVariants, 2); assert.equal(report.orphanMasterCount, 1); assert.equal(report.orphanMastersWithSourceURL, 1);
  assert.ok(!JSON.stringify(report).includes(candidate.url)); assert.ok(!JSON.stringify(report).includes('SKU'));
});

test('JSONB object key reordering never causes repeated writes or versions', async () => {
  const products = startProduct(emptyProductFactory, candidate, 'p', 'now');
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
  const persisted = reverse(products);
  const result = await repairStoredVariantSchemas({ candidates: [reverse(candidate)] }, persisted, async () => assert.fail('key order is not a data change'));
  assert.equal(result.repaired, 0);
  assert.equal(refreshProductSupplier(persisted, 'p', reverse(candidate), 'later', 'system:stored-variant-repair'), persisted);
});

test('legacy ready schemas reconcile in one batch, keep before snapshot, human fields and no new work queues', async () => {
  let products = startProduct(emptyProductFactory, candidate, 'p', 'now');
  const old = products.products[0]; old.status = 'PRONTO'; old.spec.variants = []; old.universalTitle = 'Título humano'; old.availability = 'SOB_ENCOMENDA'; old.fiscal = { ncm: '90041000' };
  products.versions = [];
  let calls = 0;
  const result = await repairStoredVariantSchemas({ candidates: [candidate] }, products, async () => assert.fail('individual writes'), 200, async ids => { calls++; products = reconcileStoredProductVariants(products, [candidate], ids, 'later', 'system:stored-variant-repair'); });
  assert.equal(calls, 1); assert.equal(result.repaired, 1); assert.equal(products.products.length, 1);
  const repaired = products.products[0]; assert.equal(repaired.status, 'EM_PRODUCAO'); assert.equal(repaired.spec.variants.length, 2); assert.equal(repaired.universalTitle, 'Título humano'); assert.equal(repaired.availability, 'SOB_ENCOMENDA'); assert.deepEqual(repaired.fiscal, { ncm: '90041000' });
  assert.equal(products.versions.find(item => item.version === 1).snapshot.status, 'PRONTO'); assert.deepEqual(products.versions.find(item => item.version === 1).snapshot.spec.variants, []);
  assert.equal(products.completionRequests, undefined);
  assert.equal((await repairStoredVariantSchemas({ candidates: [candidate] }, products, async () => assert.fail('repeat'))).repaired, 0);
});

test('a genuinely complete ready sheet retains ready status only with four independently approved media', () => {
  const measured = structuredClone(candidate); measured.category = 'Óculos'; measured.supplier.description = 'Descrição real'; measured.supplier.materials = ['PC']; measured.supplier.variants = [{ ...measured.supplier.variants[0], dimensions: { lengthCm: 14, widthCm: 14, heightCm: 3 }, weightGrams: 22.6 }];
  const state = startProduct(emptyProductFactory, measured, 'p', 'now'); state.products[0].status = 'PRONTO'; state.products[0].spec.variants = [];
  assert.equal(reconcileStoredProductVariants(state, [measured], ['p'], 'later', 'system', { p: 4 }).products[0].status, 'PRONTO');
  assert.equal(reconcileStoredProductVariants(state, [measured], ['p'], 'later', 'system', { p: 3 }).products[0].status, 'EM_PRODUCAO');
});

test('legacy false-ready record with no supplier data returns to factory without invented variants', () => {
  const state = startProduct(emptyProductFactory, candidate, 'p', 'now'); state.products[0].status = 'PRONTO'; state.products[0].spec.variants = [];
  const before = structuredClone(state.products[0].spec);
  const repaired = reconcileStoredProductVariants(state, [{ ...candidate, supplier: undefined }], ['p'], 'later', 'system');
  assert.equal(repaired.products[0].status, 'EM_PRODUCAO'); assert.deepEqual(repaired.products[0].spec, before);
  assert.equal(reconcileStoredProductVariants(repaired, [{ ...candidate, supplier: undefined }], ['p'], 'later', 'system'), repaired);
});
