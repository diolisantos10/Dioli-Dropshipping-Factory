import test from 'node:test';import assert from 'node:assert/strict';
import{causalAudit,deriveOperationalAlerts,queueCanBeReprocessed}from'../src/lib/observability.ts';
const base={generatedAt:'2026-01-01',latencyMs:20,outbox:{},queue:[],audit:{count:0,latest:null},state:[]};
test('alertas operacionais priorizam DLQ, retry, stale e latência',()=>{const alerts=deriveOperationalAlerts({...base,latencyMs:900,outbox:{DEAD:2,FAILED:1},state:[{namespace:'orders',revision:1,updatedAt:'',stale:true}]});assert.deepEqual(alerts.map(a=>a.code),['DLQ_NOT_EMPTY','RETRY_PENDING','STATE_STALE','HIGH_LATENCY']);assert.equal(alerts[0].severity,'critical')});
test('linha causal filtra eventos pelo correlation ID',()=>{const events=[{id:'1',correlationId:'a'},{id:'2',correlationId:'b'},{id:'3',correlationId:'a'}];assert.deepEqual(causalAudit(events,'a').map(e=>e.id),['1','3']);assert.equal(causalAudit(events,null).length,3)});
test('somente falhas e dead letters podem ser reprocessadas',()=>{assert.equal(queueCanBeReprocessed({status:'DEAD'}),true);assert.equal(queueCanBeReprocessed({status:'FAILED'}),true);assert.equal(queueCanBeReprocessed({status:'PUBLISHED'}),false)});
