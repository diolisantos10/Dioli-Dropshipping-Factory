import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProductFilters, isEyewearProduct, matchesApprovedCandidateFilters, matchesProductFilters, productMissingTechnical } from '../src/lib/product-filters.ts';

const candidate = { id: 'c1', name: 'Óculos solar', category: 'Moda > Acessórios', status: 'APROVADO', url: 'https://example.com/item', createdAt: '2026-10-09', notes: '', supplier: { name: 'AliExpress Santioh', ref: 'supplier-1', cost: 20, currency: 'BRL', stock: 5, imageUrl: '', images: [], variants: [] } };
const product = { id: 'p1', candidateId: 'c1', version: 1, status: 'EM_PRODUCAO', universalTitle: 'Óculos Clássico', category: 'Moda', shortDescription: '', longDescription: '', bullets: [], benefits: [], tags: [], createdAt: '', updatedAt: '', spec: { materials: ['Acetato'], variants: [{ id: 'v1', sku: 'SUN-001', title: 'Preto', weightGrams: 40, dimensions: { lengthCm: 14, widthCm: 5, heightCm: 2 } }, { id: 'v2', sku: 'SUN-002', title: 'Azul', weightGrams: null, dimensions: { lengthCm: 14, widthCm: null, heightCm: 2 } }] } };

test('eyewear filter handles Portuguese accents and English evidence, excludes accessories and supplier labels', () => {
  assert.equal(isEyewearProduct('Moda > Óculos', 'Modelo 2026'), true);
  assert.equal(isEyewearProduct('', 'Vintage Sunglasses Polarized'), true);
  assert.equal(isEyewearProduct('', 'Optical frame for women'), true);
  assert.equal(isEyewearProduct('', 'Armação de grau'), true);
  assert.equal(isEyewearProduct('Casa', 'LED Light panel'), false);
  assert.equal(isEyewearProduct('', 'Drinking glasses set'), false);
  assert.equal(isEyewearProduct('Óculos', 'Estojo para óculos'), false);
  assert.equal(isEyewearProduct('', 'Sunglasses cleaning cloth'), false);
  assert.equal(matchesProductFilters({ ...product, universalTitle: 'LED Light', category: 'Iluminação' }, { ...candidate, name: 'LED Light' }, { ...emptyProductFilters, eyewearOnly: true }), false);
});

test('filters compose SKU search, supplier, status and every variant measurement gap', () => {
  assert.deepEqual(productMissingTechnical(product), { dimensions: true, weight: true, material: false });
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, query: 'sun-002', supplier: 'AliExpress Santioh', status: 'EM_PRODUCAO', missing: 'dimensions' }), true);
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, query: 'oculos classico', missing: 'material' }), false);
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, category: 'móda', query: 'oculos classico' }), true);
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, supplier: 'Outra loja' }), false);
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, status: 'PRONTO' }), false);
});

test('studio filter uses only verified studio count passed by caller', () => {
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, media: 'complete' }, 3), false);
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, media: 'complete' }, 4), true);
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, media: 'pending' }, 4), false);
});

test('approved queue respects glasses and technical filters without modifying source', () => {
  const source = { ...candidate, supplier: { ...candidate.supplier, materials: ['Acetato'], dimensions: { lengthCm: 14, widthCm: 5, heightCm: 2 }, weightGrams: 40 } };
  const before = structuredClone(source);
  assert.equal(matchesApprovedCandidateFilters(source, { ...emptyProductFilters, eyewearOnly: true, missing: 'dimensions' }), false);
  assert.equal(matchesApprovedCandidateFilters(source, { ...emptyProductFilters, eyewearOnly: true }), true);
  assert.equal(matchesApprovedCandidateFilters(source, { ...emptyProductFilters, status: 'PRONTO' }), false);
  assert.deepEqual(source, before);
  const multi = { ...source, supplier: { ...source.supplier, variants: [{ sku: 'a', label: 'A' }, { sku: 'b', label: 'B' }] } };
  assert.equal(matchesApprovedCandidateFilters(multi, { ...emptyProductFilters, missing: 'weight' }), true);
});


test('archived master products are hidden by default and remain inspectable explicitly', () => {
  const archived = { ...product, archivedAt: '2026-10-10T01:00:00Z' };
  assert.equal(matchesProductFilters(archived, candidate, emptyProductFilters), false);
  assert.equal(matchesProductFilters(archived, candidate, { ...emptyProductFilters, archived: 'only' }), true);
  assert.equal(matchesProductFilters(product, candidate, { ...emptyProductFilters, archived: 'only' }), false);
  assert.equal(matchesProductFilters(archived, candidate, { ...emptyProductFilters, archived: 'all' }), true);
});
