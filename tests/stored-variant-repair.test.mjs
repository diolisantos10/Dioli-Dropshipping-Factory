import test from 'node:test';
import assert from 'node:assert/strict';
import { repairStoredVariantSchemas } from '../src/lib/stored-variant-repair.ts';
import { emptyProductFactory, startProduct, refreshProductSupplier } from '../src/lib/product-factory.ts';
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
test('missing origins, ambiguous SKUs, ready and archived products are never changed or invented', async () => {
  const ready = startProduct(emptyProductFactory, candidate, 'p', 'now'); ready.products[0].status = 'PRONTO'; ready.products[0].spec.variants = [];
  assert.equal((await repairStoredVariantSchemas({ candidates: [candidate] }, ready, async () => assert.fail('ready'))).repaired, 0);
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
