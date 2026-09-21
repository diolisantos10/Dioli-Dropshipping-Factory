import test from'node:test';import assert from'node:assert/strict';import{advanceOrder,emptyOrders,receiveOrder}from'../src/lib/orders.ts';
const input={externalOrderId:'ext-1',productId:'p1',salePrice:150,costSnapshot:80,currency:'BRL'};
test('pedido preserva snapshot e bloqueia duplicidade',()=>{const s=receiveOrder(emptyOrders,input,'o1','now');assert.equal(s.orders[0].costSnapshot,80);assert.throws(()=>receiveOrder(s,input,'o2','now'))});
test('fulfillment segue estados e exige tracking',()=>{let s=receiveOrder(emptyOrders,input,'o1','now');s=advanceOrder(s,'o1','VALIDADO','a');s=advanceOrder(s,'o1','EM_FULFILLMENT','b');assert.throws(()=>advanceOrder(s,'o1','ENVIADO','c'));s=advanceOrder(s,'o1','ENVIADO','c','BR123');assert.equal(s.orders[0].tracking,'BR123')});
