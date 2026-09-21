import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProductFactory, markProductReady, productGaps, restoreProductVersion, startProduct, updateProduct } from '../src/lib/product-factory.ts';

const approved = { id: 'candidate-1', name: 'Produto teste', url: 'https://example.com/', notes: 'Origem controlada', status: 'APROVADO', createdAt: '2026-01-01T00:00:00Z' };

test('produção só começa com candidato aprovado e não duplica cadastro mestre', () => {
  assert.throws(() => startProduct(emptyProductFactory, { ...approved, status: 'TRIADO' }, 'p1', 'now'), /Somente candidatos aprovados/);
  const state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  assert.equal(state.products[0].status, 'EM_PRODUCAO');
  assert.throws(() => startProduct(state, approved, 'p2', 'now'), /já possui/);
});

test('schema universal e restauração preservam histórico', () => {
  let state = startProduct(emptyProductFactory, approved, 'p-history', '2026-01-01T00:00:00Z');
  state = updateProduct(state, 'p-history', { universalTitle: 'Produto Universal', shortDescription: 'Curta', longDescription: 'Longa', category: 'Casa', bullets: ['a','b','c'], benefits: ['a','b'], tags: ['tag'], spec: { variants: [{ id: 'v1', sku: 'SKU-1', title: 'Padrão', gtin: '7890000000000', attributes: { cor: 'Preto' }, dimensions: { lengthCm: 10, widthCm: 5, heightCm: 2 }, weightGrams: 100 }], materials: ['Resina'], colors: ['Preto'], sizes: ['Único'], seo: { title: 'SEO', description: 'Descrição' }, compliance: { notes: 'Revisado', certifications: [] }, localizations: { 'pt-BR': { title: 'Produto', description: 'Descrição' } }, destinationGaps: { marketplace: ['Categoria externa'] } } }, '2026-01-01T00:01:00Z');
  assert.equal(state.products[0].spec.variants[0].sku, 'SKU-1');
  state = updateProduct(state, 'p-history', { universalTitle: 'Alterado', shortDescription: 'Curta', longDescription: 'Longa', category: 'Casa', bullets: ['a','b','c'], benefits: ['a','b'], tags: ['tag'] }, '2026-01-01T00:02:00Z');
  state = restoreProductVersion(state, 'p-history', 2, '2026-01-01T00:03:00Z');
  assert.equal(state.products[0].universalTitle, 'Produto Universal');
  assert.equal(state.products[0].version, 4);
});

test('produto incompleto não pode ser marcado como pronto', () => {
  const state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  assert.ok(productGaps(state.products[0]).length > 0);
  assert.throws(() => markProductReady(state, 'p1', 'later', false), /Complete antes/);
});

test('cadastro completo gera versão pronta sem fornecedor ou publicação', () => {
  let state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  state = updateProduct(state, 'p1', { universalTitle: 'Título', category: 'Casa', shortDescription: 'Descrição curta', longDescription: 'Descrição completa', bullets: ['Um', 'Dois', 'Três'], benefits: ['Benefício A', 'Benefício B'], tags: ['casa'] }, 'later');
  assert.throws(() => markProductReady(state, 'p1', 'finish', false), /mídia/);
  state = markProductReady(state, 'p1', 'finish', true);
  assert.equal(state.products[0].status, 'PRONTO');
  assert.equal(state.products[0].version, 3);
  assert.equal('supplierOffer' in state.products[0], false);
  assert.equal('published' in state.products[0], false);
});
