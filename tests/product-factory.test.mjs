import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProductFactory, markProductReady, productGaps, startProduct, updateProduct } from '../src/lib/product-factory.ts';

const approved = { id: 'candidate-1', name: 'Produto teste', url: 'https://example.com/', notes: 'Origem controlada', status: 'APROVADO', createdAt: '2026-01-01T00:00:00Z' };

test('produção só começa com candidato aprovado e não duplica cadastro mestre', () => {
  assert.throws(() => startProduct(emptyProductFactory, { ...approved, status: 'TRIADO' }, 'p1', 'now'), /Somente candidatos aprovados/);
  const state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  assert.equal(state.products[0].status, 'EM_PRODUCAO');
  assert.throws(() => startProduct(state, approved, 'p2', 'now'), /já possui/);
});

test('produto incompleto não pode ser marcado como pronto', () => {
  const state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  assert.ok(productGaps(state.products[0]).length > 0);
  assert.throws(() => markProductReady(state, 'p1', 'later'), /Complete antes/);
});

test('cadastro completo gera versão pronta sem fornecedor ou publicação', () => {
  let state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  state = updateProduct(state, 'p1', { universalTitle: 'Título', category: 'Casa', shortDescription: 'Descrição curta', longDescription: 'Descrição completa', bullets: ['Um', 'Dois', 'Três'], benefits: ['Benefício A', 'Benefício B'], tags: ['casa'] }, 'later');
  state = markProductReady(state, 'p1', 'finish');
  assert.equal(state.products[0].status, 'PRONTO');
  assert.equal(state.products[0].version, 3);
  assert.equal('supplierOffer' in state.products[0], false);
  assert.equal('published' in state.products[0], false);
});
