import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGatewayText, gatewayConfigurationStatus, GATEWAY_CAPABILITIES } from '../src/lib/ai-gateway.ts';

const env = {
  CONTROL_ROOM_GATEWAY_URL: 'https://control.example', CONTROL_ROOM_SERVICE_TOKEN: 'private-test-token',
  CONTROL_ROOM_COST_CENTER_ID: '00000000-0000-4000-8000-000000000001', CONTROL_ROOM_HOLDING_ID: 'dioli',
};
const request = { roleAddress: 'dioli.ddf.product.cadastro', system: 'Use apenas fonte confirmada.', prompt: 'Fonte do fornecedor', payloadRef: 'ddf:product:1' };
function configure(t) {
  for(const [key,value] of Object.entries(env)) {
    const original=process.env[key]; process.env[key]=value;
    t.after(()=>{if(original===undefined)delete process.env[key];else process.env[key]=original;});
  }
}

test('cliente usa contrato real português e recebe conteudo do adapter, sem chave de fornecedor', async t => {
  configure(t);
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://control.example/api/v1/ai/gateway/execute');
    assert.equal(init.headers['X-Service-Token'], env.CONTROL_ROOM_SERVICE_TOKEN);
    sent=JSON.parse(init.body);
    return Response.json({ok:true,tier:'primario',provedorId:'xai',modeloId:'configured-model',resultado:{sucesso:true,conteudo:'{"title":"Óculos"}',proveniencia:{provider_id:'xai',credential_ref:'never-expose'}}});
  });
  const result=await generateGatewayText(request);
  assert.equal(result.text,'{"title":"Óculos"}');
  assert.equal(sent.modalidade,'text');
  assert.equal(sent.centroCustoId,env.CONTROL_ROOM_COST_CENTER_ID);
  assert.equal(sent.payloadRef,request.payloadRef);
  assert.deepEqual(sent.mensagens.map(m=>m.role),['system','user']);
  assert.equal('model' in sent,false);
  assert.equal('credential_ref' in result.provenance,false);
});

test('rejeição por pareamento não vaza resposta nem segredo e não vira sucesso',async t=>{
  configure(t);
  t.mock.method(globalThis,'fetch',async()=>Response.json({erro:env.CONTROL_ROOM_SERVICE_TOKEN},{status:401}));
  await assert.rejects(generateGatewayText(request),e=>e.code==='gateway_pairing_required'&&!e.message.includes(env.CONTROL_ROOM_SERVICE_TOKEN));
});

test('sem configuração falha antes da rede e referências visuais não são prometidas',()=>{
  assert.equal(gatewayConfigurationStatus().configured,false);
  assert.equal(GATEWAY_CAPABILITIES.referenceImages,false);
  assert.equal(GATEWAY_CAPABILITIES.vision,false);
});
