import test from 'node:test';
import assert from 'node:assert/strict';
import { readSupplierImages } from '../src/lib/providers/supplier-vision.ts';
import { executeCommand, emptyStates } from '../src/lib/commands.ts';

const base = { name: 'AliExpress', ref: '99', cost: 10, currency: 'BRL', stock: 1, imageUrl: 'https://ae01.alicdn.com/1.jpg', images: ['https://ae01.alicdn.com/1.jpg'], variants: [] };
const output = facts => ({ text: JSON.stringify({ facts }), providerId: 'openai', modelId: 'configured', tier: 'primario', provenance: {} });

test('visão preenche só medidas explícitas, com fonte, e não troca unidade sem conversão', async () => {
  const enriched = await readSupplierImages(base, 'candidate:1', async request => {
    assert.equal(request.roleAddress, 'dioli.ddf.supplier-import');
    assert.deepEqual(request.referenceImages, base.images);
    return output([{ imageUrl: base.imageUrl, sku: null, quote: 'Width: 120 mm\nNet weight: 0.2 kg' }]);
  });
  assert.equal(enriched.dimensions.widthCm, 12);
  assert.equal(enriched.weightGrams, 200);
  assert.equal(enriched.facts[0].imageUrl, base.imageUrl);
  assert.equal(enriched.vision.completed, true);
  assert.equal(base.dimensions, undefined);
  const result = executeCommand('intake.addCandidate', structuredClone(emptyStates), { name: 'produto', url: 'https://www.aliexpress.com/item/99.html', notes: '', supplier: enriched }, { actor: 'test', role: 'ADMIN', at: '2026-10-09T12:00:00Z', newId: () => 'candidate' });
  assert.equal(result.payload.candidates[0].supplier.vision.completed, true);
  assert.equal(result.payload.candidates[0].supplier.facts[0].imageUrl, base.imageUrl);
});

test('foto de SKU não fornece medida global nem contamina outro SKU', async () => {
  const supplier = { ...base, variants: [{ sku: 'small', label: 'Small', imageUrl: base.imageUrl, price: 10, stock: 1 }, { sku: 'large', label: 'Large', price: 15, stock: 1 }] };
  const enriched = await readSupplierImages(supplier, 'candidate:1', async () => output([
    { imageUrl: base.imageUrl, sku: 'small', quote: 'Height: 10 cm' },
    { imageUrl: base.imageUrl, sku: 'large', quote: 'Height: 20 cm' },
    { imageUrl: base.imageUrl, sku: null, quote: 'Height: 30 cm' },
  ]));
  assert.equal(enriched.variants[0].dimensions.heightCm, 10);
  assert.equal(enriched.variants[1].dimensions.heightCm, undefined);
  assert.equal(enriched.dimensions.heightCm, undefined);
});

test('lotes percorrem todas as fotos e contradição posterior remove valor escolhido', async () => {
  const supplier = { ...base, images: Array.from({ length: 9 }, (_, i) => `https://ae01.alicdn.com/${i + 1}.jpg`) };
  let first = await readSupplierImages(supplier, 'candidate:1', async request => {
    assert.equal(request.referenceImages.length, 8);
    return output([{ imageUrl: supplier.images[0], sku: null, quote: 'Height: 10 cm' }]);
  });
  assert.equal(first.vision.completed, false);
  assert.equal(first.dimensions.heightCm, 10);
  first = await readSupplierImages(first, 'candidate:1', async request => {
    assert.deepEqual(request.referenceImages, [supplier.images[8]]);
    return output([{ imageUrl: supplier.images[8], sku: null, quote: 'Height: 14 cm' }]);
  });
  assert.equal(first.vision.completed, true);
  assert.equal(first.dimensions.heightCm, undefined);
  assert.equal(first.facts.length, 2);
});

test('origem inventada ou resposta inválida nunca conclui o lote', async () => {
  await assert.rejects(readSupplierImages(base, 'candidate:1', async () => output([{ imageUrl: 'https://other.example/fake.jpg', quote: 'Height: 10 cm' }])), /origem inválida/);
  await assert.rejects(readSupplierImages(base, 'candidate:1', async () => ({ ...output([]), text: 'não sei' })), /JSON inválido/);
  assert.equal(base.vision, undefined);
});

test('polegadas da tela e embalagem não viram dimensões físicas do produto', async () => {
  const enriched = await readSupplierImages(base, 'candidate:1', async () => output([{ imageUrl: base.imageUrl, quote: '14 inch light\nPackage height: 50 cm', sku: null }]));
  assert.equal(enriched.dimensions.heightCm, undefined);
  assert.equal(enriched.facts.length, 0);
});
