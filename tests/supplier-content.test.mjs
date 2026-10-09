import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierDescriptionContent, supplierMeasurements } from '../src/lib/providers/supplier-content.ts';
import { parseDsProduct } from '../src/lib/providers/aliexpress.ts';
import { supplierCandidateInput } from '../src/lib/supplier-product.ts';
import { executeCommand, emptyStates } from '../src/lib/commands.ts';

test('descrição preserva imagens lazy, srcset e texto decodificado sem scripts', () => {
  const result = supplierDescriptionContent(`<p>Dimens&#245;es &amp; materiais</p>
    <img src="data:image/png;base64,invalid" data-src="//ae01.alicdn.com/detail.jpg?a=1&amp;b=2" alt="Painel 14 polegadas">
    <picture><source srcset="https://ae01.alicdn.com/large.jpg 2x, https://ae01.alicdn.com/small.jpg 1x"></picture>
    <img data-original=https://ae01.alicdn.com/original.jpg>
    <script><img src="https://ae01.alicdn.com/injected.jpg">secret()</script>
    <table><tr><th>Material</th><td>Alumínio</td></tr></table>`);
  assert.equal(result.images.length, 4);
  assert.ok(result.images.includes('https://ae01.alicdn.com/detail.jpg?a=1&b=2'));
  assert.equal(result.description.includes('secret()'), false);
  assert.match(result.description, /Dimensões & materiais/);
  assert.equal(result.specifications.Material, 'Alumínio');
  assert.deepEqual(result.imageLabels, ['Painel 14 polegadas']);
});

test('medidas exigem rótulo e unidade; embalagem não vira produto', () => {
  const result = supplierMeasurements('Length: 120 mm\nWidth: 5 inches\nNet weight: 0.25 kg\nPackage height: 40 cm\n14 inch light\nHeight: 10', 'description');
  assert.deepEqual(result.dimensions, { lengthCm: 12, widthCm: 12.7 });
  assert.equal(result.weightGrams, 250);
  assert.equal(result.facts.length, 3);
});

test('valores conflitantes ficam na evidência; não são escolhidos silenciosamente', () => {
  const result = supplierMeasurements('Height: 10 cm\nHeight: 14 cm', 'description');
  assert.equal(result.dimensions, undefined);
  assert.equal(result.facts.length, 2);
});

test('variantes mantêm medidas próprias e evidências sobrevivem à prateleira', () => {
  const raw = { ae_item_base_info_dto: { product_id: 99, subject: '10/14 inch LED Light', detail: '<p>Package height: 50 cm</p><table><tr><td>Material</td><td>Metal</td></tr></table>' },
    ae_item_sku_info_dtos: [{ sku_id: '10', sku_price: '10', ae_sku_property_dtos: [{ sku_property_name: 'Height', sku_property_value: '10 cm' }] },
      { sku_id: '14', sku_price: '15', ae_sku_property_dtos: [{ sku_property_name: 'Height', sku_property_value: '14 cm' }] }] };
  const product = parseDsProduct({ result: raw }, '99', 'BRL');
  assert.equal(product.dimensions, undefined);
  assert.equal(product.variants[0].dimensions.heightCm, 10);
  assert.equal(product.variants[1].dimensions.heightCm, 14);
  assert.equal(product.variants[1].facts[0].sku, '14');
  assert.equal(product.materials[0], 'Metal');
  assert.deepEqual(product.rawData, raw);
  const candidate = supplierCandidateInput(product, 'AliExpress');
  assert.equal(candidate.supplier.importRevision, 2);
  assert.equal(candidate.supplier.variants[1].dimensions.heightCm, 14);
  const persisted = executeCommand('intake.addCandidate', structuredClone(emptyStates), candidate,
    { actor: 'test', role: 'ADMIN', at: '2026-10-09T12:00:00Z', newId: () => 'test-import' }).payload.candidates[0];
  assert.equal(persisted.supplier.importRevision, 2);
  assert.equal(persisted.supplier.variants[1].dimensions.heightCm, 14);
  assert.equal(persisted.supplier.variants[1].facts[0].sku, '14');
});
