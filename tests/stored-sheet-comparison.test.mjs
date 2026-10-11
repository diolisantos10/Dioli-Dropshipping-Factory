import test from 'node:test';
import assert from 'node:assert/strict';
import { storedSheetComparison } from '../src/lib/stored-sheet-comparison.ts';
import { startProduct, emptyProductFactory } from '../src/lib/product-factory.ts';

test('comparison selects the real pilot identity and one older eyewear sheet using saved data only', () => {
  const source = { id: 'pilot-origin', name: 'Óculos teste', url: 'https://www.aliexpress.com/item/1005013226256365.html', notes: '', status: 'APROVADO', createdAt: 'now', supplier: { name: 'AliExpress', ref: '1005013226256365', cost: 5, currency: 'BRL', stock: null, imageUrl: '', images: [], specifications: { Material: 'PC' }, variants: [{ sku: 'black', label: 'Preto', price: 5, stock: 2, imageUrl: 'https://fixture.invalid/black.png', attributes: { Cor: 'Preto' } }] } };
  const oldSource = { ...structuredClone(source), id: 'old-origin', url: 'https://www.aliexpress.com/item/2.html', supplier: { ...structuredClone(source.supplier), ref: '2' } };
  let state = startProduct(emptyProductFactory, source, 'pilot', 'now');
  state = startProduct(state, oldSource, 'old', 'now');
  state.products[0].status = 'PRONTO'; state.products[0].spec.variants = [];
  const intake = { candidates: [oldSource, source] };
  const before = JSON.stringify([intake, state]);
  const report = storedSheetComparison(intake, state, '1005013226256365');
  assert.equal(report.pilot.savedVariantCount, 1);
  assert.equal(report.pilot.displayedVariantImages, 1);
  assert.equal(report.legacy.savedVariantCount, 0);
  assert.equal(report.legacy.displayedVariantImages, 1);
  assert.equal(report.legacy.originalLinkPresent, true);
  assert.equal(JSON.stringify([intake, state]), before);
  assert.ok(!JSON.stringify(report).includes('black'));
  assert.ok(!JSON.stringify(report).includes('https://'));
  assert.equal(storedSheetComparison({ candidates: [] }, { products: [] }, '1005013226256365').pilot.found, false);
});
