import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, emptyStates, authorizeCommand } from '../src/lib/commands.ts';

let counter = 0;
const ctx = (role = 'ADMIN', actor = 'dioli') => ({ role, actor, at: new Date(Date.parse('2026-09-25T12:00:00Z') + (counter += 1000)).toISOString(), newId: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}` });
function run(states, type, input, context = ctx()) {
  const { namespace, payload } = executeCommand(type, states, input, context);
  return { ...states, [namespace]: payload };
}

function readyWorld() {
  let s = structuredClone(emptyStates);
  s = run(s, 'intake.addCandidate', { name: 'Óculos polarizado', url: 'https://www.aliexpress.com/item/1005001.html', notes: 'teste', evidence: [] }, ctx('OPERATOR', 'ana'));
  const candidateId = s.intake.candidates[0].id;
  s = run(s, 'intake.transition', { candidateId, status: 'TRIADO', reason: 'triado' }, ctx('OPERATOR'));
  s = run(s, 'intake.transition', { candidateId, status: 'APROVADO', reason: 'margem ok' }, ctx('APPROVER', 'bruno'));
  s = run(s, 'products.start', { candidateId });
  const productId = s.products.products[0].id;
  s = run(s, 'products.update', { productId, universalTitle: 'Óculos', category: 'Acessórios', shortDescription: 'curta', longDescription: 'longa', bullets: ['a', 'b', 'c'], benefits: ['x', 'y'], tags: ['sol'] });
  return { s, candidateId, productId };
}

test('ator autenticado e horário do servidor ficam registrados na decisão', () => {
  const { s } = readyWorld();
  const approval = s.intake.events.find((event) => event.after === 'APROVADO');
  assert.equal(approval.actor, 'bruno');
  assert.equal(s.intake.events.at(-1).actor, 'ana');
});

test('portão de portfólio: operador não aprova nem rejeita candidato', () => {
  assert.throws(() => authorizeCommand('intake.transition', { status: 'APROVADO' }, 'OPERATOR'), /papel/);
  assert.throws(() => authorizeCommand('intake.transition', { status: 'REJEITADO' }, 'OPERATOR'), /papel/);
  assert.doesNotThrow(() => authorizeCommand('intake.transition', { status: 'TRIADO' }, 'OPERATOR'));
  assert.throws(() => authorizeCommand('intake.addCandidate', {}, 'VIEWER'), /papel/);
});

test('produto só fica PRONTO com mídia aprovada lida do servidor', () => {
  let { s, productId } = readyWorld();
  assert.throws(() => run(s, 'products.markReady', { productId }), /mídia/i);
  s = run(s, 'media.addAsset', { asset: { productId, url: 'https://img.test/a.jpg', kind: 'ORIGINAL', purpose: 'principal', provenance: 'fornecedor', rightsStatus: 'DECLARADO' } });
  assert.throws(() => run(s, 'media.review', { assetId: s.media.assets[0].id, status: 'APROVADA' }, ctx('OPERATOR')), /papel/);
  s = run(s, 'media.review', { assetId: s.media.assets[0].id, status: 'APROVADA' }, ctx('APPROVER'));
  s = run(s, 'products.markReady', { productId }, ctx('APPROVER'));
  assert.equal(s.products.products[0].status, 'PRONTO');
  assert.throws(() => run(s, 'media.addAsset', { asset: { productId, url: 'https://img.test/b.jpg', kind: 'ORIGINAL', purpose: 'extra', provenance: 'x' } }), /em produção/);
});

test('pricing exige produto PRONTO e aprovação usa o usuário autenticado', () => {
  let { s, productId } = readyWorld();
  const priceInput = { productId, currency: 'brl', supplierCost: 30, shipping: 10, taxes: 5, fixedFees: 1, operatingCost: 2, reserve: 2, channelFeePercent: 10, paymentFeePercent: 5, targetMarginPercent: 30, minimumMarginPercent: 15 };
  assert.throws(() => run(s, 'pricing.calculate', { input: priceInput }), /PRONTOS/);
  s = run(s, 'media.addAsset', { asset: { productId, url: 'https://img.test/a.jpg', kind: 'ORIGINAL', purpose: 'p', provenance: 'x' } });
  s = run(s, 'media.review', { assetId: s.media.assets[0].id, status: 'APROVADA' });
  s = run(s, 'products.markReady', { productId });
  s = run(s, 'pricing.calculate', { input: priceInput }, ctx('OPERATOR'));
  const calc = s.pricing.calculations[0];
  assert.equal(calc.currency, 'BRL');
  assert.equal(calc.status, 'CALCULADO');
  assert.throws(() => run(s, 'pricing.approve', { calculationId: calc.id }, ctx('OPERATOR')), /papel/);
  s = run(s, 'pricing.approve', { calculationId: calc.id, approvedBy: 'forjado' }, ctx('APPROVER', 'carla'));
  assert.equal(s.pricing.calculations[0].approvedBy, 'carla');
});

test('pedidos e catálogo exigem produto PRONTO; cancelamento é decisão de aprovador', () => {
  let { s, productId } = readyWorld();
  assert.throws(() => run(s, 'orders.receive', { externalOrderId: 'E1', productId, salePrice: 100, costSnapshot: 50 }), /PRONTOS/);
  assert.throws(() => run(s, 'catalog.addOffer', { productId, supplierRef: '1005001', supplierName: 'AliExpress', cost: 10, currency: 'USD' }), /PRONTOS/);
  s = run(s, 'media.addAsset', { asset: { productId, url: 'https://img.test/a.jpg', kind: 'ORIGINAL', purpose: 'p', provenance: 'x' } });
  s = run(s, 'media.review', { assetId: s.media.assets[0].id, status: 'APROVADA' });
  s = run(s, 'products.markReady', { productId });
  s = run(s, 'orders.receive', { externalOrderId: 'E1', productId, salePrice: 100, costSnapshot: 50 }, ctx('SYSTEM', 'system:cron'));
  assert.throws(() => run(s, 'orders.receive', { externalOrderId: 'E1', productId, salePrice: 100, costSnapshot: 50 }), /já processado/);
  const orderId = s.orders.orders[0].id;
  s = run(s, 'orders.flagException', { orderId, reason: 'endereço', category: 'ENDERECO' }, ctx('OPERATOR'));
  assert.throws(() => run(s, 'orders.resolveException', { orderId, resolution: 'CANCELAR' }, ctx('OPERATOR')), /papel/);
  s = run(s, 'orders.resolveException', { orderId, resolution: 'RECUPERAR' }, ctx('OPERATOR'));
  assert.equal(s.orders.orders[0].status, 'RECEBIDO');
  s = run(s, 'catalog.addOffer', { productId, supplierRef: '1005001', supplierName: 'AliExpress', cost: 10, currency: 'usd', stock: 5 });
  s = run(s, 'catalog.refreshOffer', { offerId: s.catalog.offers[0].id, cost: 12.5, currency: 'USD', stock: 0, leadTimeDays: 15 }, ctx('SYSTEM'));
  assert.equal(s.catalog.offers[0].cost, 12.5);
  assert.throws(() => run(s, 'catalog.refreshOffer', { offerId: s.catalog.offers[0].id, cost: 1, currency: 'USD' }, ctx('OPERATOR')), /papel/);
});

test('entrada inválida e comando desconhecido são recusados', () => {
  assert.throws(() => executeCommand('nao.existe', emptyStates, {}, ctx()), /desconhecido/);
  assert.throws(() => executeCommand('__proto__', emptyStates, {}, ctx()), /desconhecido/);
  assert.throws(() => executeCommand('intake.addCandidate', emptyStates, { name: 5, url: 'https://a.b' }, ctx()), /Campo inválido: name/);
  assert.throws(() => executeCommand('intake.transition', emptyStates, { candidateId: 'x', status: 'HACK', reason: 'r' }, ctx()), /Valor inválido: status/);
});
