import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierTechnicalAttributes } from '../src/lib/providers/supplier-attributes.ts';
import { supplierMeasurements } from '../src/lib/providers/supplier-content.ts';
import { readSupplierImages } from '../src/lib/providers/supplier-vision.ts';
import { supplierPageUrl, parsePageDecision } from '../src/lib/providers/supplier-page.ts';
import { executeCommand, emptyStates } from '../src/lib/commands.ts';

test('audited commands preserve technical evidence and failure checkpoints', () => {
  const imageUrl = 'https://ae01.alicdn.com/spec.jpg';
  const supplier = { name: 'AliExpress', ref: '1005013226256365', cost: 1, currency: 'BRL', stock: 1, imageUrl, images: [imageUrl], variants: [], visualAttributes: [{ key: 'Modelo', value: 'SE69170', quote: 'Model SE69170', imageUrl }], technicalReadFailure: { revision: 2, code: 'technical_source_read_interrupted' }, pageRead: { revision: 2, status: 'FAILED', at: '2026-10-11T18:00:00Z', actions: [], code: 'supplier_page_interrupted', documents: ['Model SE69170'] } };
  const states = structuredClone(emptyStates);
  const context = { role: 'ADMIN', actor: 'test', at: '2026-10-11T18:00:00Z', newId: () => 'pilot' };
  states.intake = executeCommand('intake.addCandidate', states, { name: 'Pilot', url: 'https://pt.aliexpress.com/item/1005013226256365.html', notes: '', supplier }, context).payload;
  const saved = executeCommand('intake.refreshSupplier', states, { candidateId: 'pilot', supplier }, context).payload.candidates[0].supplier;
  assert.deepEqual(saved.visualAttributes, supplier.visualAttributes);
  assert.deepEqual(saved.technicalReadFailure, supplier.technicalReadFailure);
  assert.deepEqual(saved.pageRead, supplier.pageRead);
  assert.throws(() => executeCommand('intake.refreshSupplier', states, { candidateId: 'pilot', supplier: { ...supplier, visualAttributes: [{ ...supplier.visualAttributes[0], imageUrl: 'https://other.example/invented.jpg' }] } }, context), /Origem/);
});

test('SE69170 component dimensions never become whole-product or package dimensions', () => {
  const text = 'Lens width: 57 mm\nLens height: 32 mm\nBridge width: 17 mm\nTemple length: 146 mm\nWeight: 22.6 g\nPackage weight: 100 g';
  assert.deepEqual(supplierTechnicalAttributes(text), { 'Largura da lente': '57 mm', 'Altura da lente': '32 mm', 'Comprimento da haste': '146 mm', 'Largura da ponte': '17 mm' });
  const measured = supplierMeasurements(text, 'image');
  assert.equal(measured.dimensions, undefined);
  assert.equal(measured.weightGrams, 22.6);
});

test('technical OCR rereads old checkpoints and preserves source and variant boundaries', async () => {
  const image = 'https://ae01.alicdn.com/spec.jpg';
  const supplier = { name: 'AliExpress', ref: '1005013226256365', cost: 10, currency: 'BRL', stock: 1, imageUrl: image, images: [image], variants: [], vision: { revision: 1, completed: true, processedImages: [image] } };
  let calls = 0;
  const result = await readSupplierImages(supplier, 'pilot', async () => {
    calls++;
    return { text: JSON.stringify({ facts: [{ imageUrl: image, quote: 'Lens width: 57 mm\nWeight: 22.6 g' }], attributes: [{ imageUrl: image, key: 'Material da armação', value: 'PC + metal', quote: 'Frame PC METAL' }] }) };
  });
  assert.equal(result.weightGrams, 22.6);
  assert.equal(result.specifications['Largura da lente'], '57 mm');
  assert.equal(result.specifications['Material da armação'], 'PC + metal');
  assert.equal(result.visualAttributes[0].imageUrl, image);
  await readSupplierImages(result, 'pilot', async () => { throw new Error('must not repeat paid OCR'); });
  assert.equal(calls, 1);
});

test('exploration accepts renamed menus while rejecting foreign evidence and purchases', () => {
  const observation = { bottom: true, blocks: [{ id: 0, text: 'Lens width 57 mm', foreignProduct: false }, { id: 1, text: 'Different product', foreignProduct: true }], controls: [{ id: 4, label: 'Ficha ampliada 2027', href: '', transactional: false }, { id: 5, label: 'Comprar', href: '', transactional: true }] };
  const plan = { action: 'click', controlId: 4, relevantBlockIds: [0], reason: 'Menu contains technical attributes' };
  assert.equal(parsePageDecision(JSON.stringify(plan), observation).controlId, 4);
  assert.throws(() => parsePageDecision(JSON.stringify({ ...plan, controlId: 5 }), observation), /unsafe_action/);
  assert.throws(() => parsePageDecision(JSON.stringify({ ...plan, relevantBlockIds: [1] }), observation), /foreign_evidence/);
  assert.throws(() => parsePageDecision(JSON.stringify({ ...plan, action: 'finish' }), { ...observation, bottom: false }), /incomplete_scroll/);
  assert.equal(supplierPageUrl('1005013226256365'), 'https://pt.aliexpress.com/item/1005013226256365.html');
  assert.throws(() => supplierPageUrl('https://localhost'), /invalid_item/);
});
