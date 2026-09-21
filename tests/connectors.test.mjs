import test from 'node:test';import assert from 'node:assert/strict';import{emptyConnectors,simulateSync}from'../src/lib/connectors.ts';
test('sync é idempotente',()=>{const a=simulateSync(emptyConnectors,'supplier-simulator','k1','now');const b=simulateSync(a,'supplier-simulator','k1','later');assert.deepEqual(a,b)});
test('falha fica isolada no adapter',()=>{const s=simulateSync(emptyConnectors,'supplier-simulator','k2','now',true);assert.equal(s.connectors[0].health,'DEGRADED');assert.equal(s.connectors[1].health,'HEALTHY')});
