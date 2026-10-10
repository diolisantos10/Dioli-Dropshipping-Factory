import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReviewedStudioImage } from '../src/lib/studio-gateway.ts';
import { generateGatewayImage, generateGatewayText, validGatewayReference } from '../src/lib/ai-gateway.ts';
const input = { productId: 'p1', title: 'Óculos preto', angle: 'frontal', references: ['https://ae01.alicdn.com/front.png'], correlationId: 'c1' };
const textResult = text => ({ text: JSON.stringify(text), providerId: 'openai', modelId: 'review', tier: 'primario', provenance: {} });
const image = { base64: Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64'), mimeType: 'image/png', providerId: 'openai', modelId: 'image', generationId: 'request1' };

test('fonte não mostra ângulo: bloqueia antes de pagar geração', async () => {
  let generated = 0;
  await assert.rejects(generateReviewedStudioImage(input, { text: async () => textResult({ approved:false, sourceSupportsAngle:false, evidence:'Só imagem frontal; lateral oculta.' }), image: async () => { generated++; return image; } }), e => e.code === 'studio_unsupported_view');
  assert.equal(generated, 0);
});

test('gera uma imagem e exige revisão independente incluindo PNG inline sem abrir mídia privada', async () => {
  const requests=[];
  const result=await generateReviewedStudioImage(input, { text:async req=>{requests.push(req);return textResult({approved:true,sourceSupportsAngle:true,neutralBackground:true,evidence:'Formato, cor e lente equivalentes à referência frontal.'});}, image:async req=>{assert.equal(req.roleAddress,'dioli.ddf.media-factory');assert.deepEqual(req.referenceImages,input.references);return image;} });
  assert.equal(result.approved,true);
  assert.equal(requests.length,2);
  assert.equal(requests[1].roleAddress,'dioli.ddf.media-review');
  assert.equal(requests[1].referenceImages.at(-1),`data:image/png;base64,${image.base64}`);
});

test('imagem deformada ou revisão sem evidência nunca é aprovada', async () => {
  let call=0;
  const result=await generateReviewedStudioImage(input,{image:async()=>image,text:async()=>textResult(++call===1?{approved:true,sourceSupportsAngle:true,neutralBackground:true,evidence:'Frontal visível'}:{approved:false,sourceSupportsAngle:true,evidence:'Lentes alteradas'})});
  assert.equal(result.approved,false);
  await assert.rejects(generateReviewedStudioImage(input,{image:async()=>image,text:async()=>textResult({approved:true,sourceSupportsAngle:true,neutralBackground:true,evidence:''})}),e=>e.code==='studio_invalid_review');
});

test('transporte de imagem mantém referências e centralização, rejeita base64 inválido',async t=>{
  const vars={CONTROL_ROOM_GATEWAY_URL:'https://control.example',CONTROL_ROOM_SERVICE_TOKEN:'service-token',CONTROL_ROOM_COST_CENTER_ID:'00000000-0000-4000-8000-000000000001',CONTROL_ROOM_HOLDING_ID:'dioli'};
  for(const[key,value]of Object.entries(vars)){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
  let sent;
  t.mock.method(globalThis,'fetch',async(_url,init)=>{sent=JSON.parse(init.body);return Response.json({ok:true,provedorId:'openai',modeloId:'central-model',resultado:{sucesso:true,conteudo:[{b64_json:image.base64}],proveniencia:{request_id:'r1'}}});});
  const request={roleAddress:'dioli.ddf.media-factory',system:'Preserve',prompt:'Estúdio',payloadRef:'p1',referenceImages:input.references};
  assert.equal((await generateGatewayImage(request)).generationId,'r1');
  assert.equal(sent.modalidade,'image');assert.equal(sent.n,1);assert.deepEqual(sent.imagensReferencia,input.references);assert.equal('model' in sent,false);
  assert.equal(validGatewayReference('data:image/svg+xml;base64,AAAA'),false);
  assert.equal(validGatewayReference('data:image/png;base64,@@@'),false);
  await generateGatewayText({...request,referenceImages:[`data:image/png;base64,${image.base64}`]}).catch(e=>assert.equal(e.code,'gateway_invalid_response'));
  assert.equal(sent.modalidade,'vision');
});
