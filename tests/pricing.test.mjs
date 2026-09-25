import test from 'node:test'; import assert from 'node:assert/strict'; import { approvePrice, calculatePrice, emptyPricing, releaseQuarantine, roundMoney } from '../src/lib/pricing.ts';
const base = { productId:'p1', supplierCost:50, shipping:10, taxes:5, fixedFees:2, channelFeePercent:12, paymentFeePercent:4, operatingCost:3, reserve:5, targetMarginPercent:25, minimumMarginPercent:15, currency:'BRL' };
test('preço preserva componentes e é explicável', () => { const c=calculatePrice(emptyPricing,base,'x','now').calculations[0]; assert.equal(c.totalFixedCost,75); assert.equal(c.status,'CALCULADO'); assert.ok(c.suggestedPrice > c.minimumSafePrice); });
test('margin guard bloqueia cálculo inseguro', () => { const c=calculatePrice(emptyPricing,{...base,targetMarginPercent:10,minimumMarginPercent:20},'x','now').calculations[0]; assert.equal(c.status,'BLOQUEADO'); assert.equal(c.suggestedPrice,null); });
test('contexto, FX, aprovação e quarentena são controlados',()=>{let state=calculatePrice(emptyPricing,{...base,country:'BR',channel:'sandbox',store:'loja',fxRate:1},'v1','2026-01-01T00:00:00Z');state=approvePrice(state,'v1','Dioli','2026-01-01T00:01:00Z');assert.equal(state.calculations[0].approval,'APROVADO');state=calculatePrice(state,{...base,supplierCost:200,country:'BR',channel:'sandbox',store:'loja',fxRate:1},'v2','2026-01-01T00:02:00Z');assert.equal(state.calculations[0].status,'QUARENTENA');assert.match(state.calculations[0].reason,/30%/)});
test('arredondamento monetário é previsível e registra fontes',()=>{assert.equal(roundMoney(1.005),1.01);const c=calculatePrice(emptyPricing,{...base,supplierCost:10.005},'m','now').calculations[0];assert.equal(c.totalFixedCost,35.01);assert.equal(c.sources.fx.version,'manual-v1')});
test('limites inseguros são bloqueados',()=>{assert.throws(()=>calculatePrice(emptyPricing,{...base,channelFeePercent:101},'x','now'),/100%/);const c=calculatePrice(emptyPricing,{...base,channelFeePercent:60,paymentFeePercent:20,targetMarginPercent:20},'x','now').calculations[0];assert.equal(c.status,'BLOQUEADO')});
test('quarentena exige justificativa e volta pendente para aprovação',()=>{let state=calculatePrice(emptyPricing,{...base,country:'BR'},'a','now');state=calculatePrice(state,{...base,country:'BR',supplierCost:200},'b','later');assert.throws(()=>releaseQuarantine(state,'b','D','curta'),/justificativa/);state=releaseQuarantine(state,'b','Dioli','Impacto econômico revisado');assert.equal(state.calculations[0].status,'CALCULADO');assert.equal(state.calculations[0].approval,'PENDENTE')});

test('recálculo automático gera nova versão pendente e respeita a quarentena do Margin Guard', async () => {
  const { calculatePrice, approvePrice, recalculateSupplierCost, emptyPricing } = await import('../src/lib/pricing.ts');
  const base = { productId: 'p1', supplierCost: 30, shipping: 10, taxes: 5, fixedFees: 1, channelFeePercent: 10, paymentFeePercent: 5, operatingCost: 2, reserve: 2, targetMarginPercent: 30, minimumMarginPercent: 15, currency: 'BRL', channel: 'shopify' };
  let state = calculatePrice(emptyPricing, base, 'c1', '2026-09-25T00:00:00Z');
  state = approvePrice(state, 'c1', 'carla', '2026-09-25T00:01:00Z');
  const small = recalculateSupplierCost(state, 'c1', 32, 'c2', '2026-09-25T01:00:00Z');
  assert.equal(small.calculations[0].id, 'c2');
  assert.equal(small.calculations[0].version, 2);
  assert.equal(small.calculations[0].status, 'CALCULADO');
  assert.equal(small.calculations[0].approval, 'PENDENTE');
  assert.match(small.calculations[0].reason, /30 → 32/);
  assert.equal(small.calculations[1].approval, 'APROVADO', 'preço aprovado anterior não é alterado');
  const big = recalculateSupplierCost(state, 'c1', 60, 'c3', '2026-09-25T01:00:00Z');
  assert.equal(big.calculations[0].status, 'QUARENTENA');
  assert.equal(recalculateSupplierCost(state, 'c1', 30, 'c4', 'x'), state, 'custo igual não gera versão');
  assert.throws(() => recalculateSupplierCost(small, 'c1', 40, 'c5', 'x'), /mais recente/);
});
