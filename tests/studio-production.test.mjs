import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyMedia, ingestSupplierOriginals, studioReadiness, approvedStudioAssets } from '../src/lib/media-factory.ts';
import { generateStudioPack } from '../src/lib/studio-production.ts';
const at = '2026-10-09T12:00:00Z';
const originalUrls = Array.from({length:4},(_,i)=>`https://supplier.example/${i}.jpg`);
const source = () => ingestSupplierOriginals(emptyMedia,'p',originalUrls,'AliExpress',at);
const output = () => Array.from({length:4},(_,i)=>({url:`https://studio.example/${i}.png`,angle:`vista-${i}`,sourceAssetIds:[`p-original-${i+1}`],fidelityVerified:true,fidelityEvidence:`Vista ${i} comprovada pelo original ${i}`,neutralBackground:true,mimeType:'image/png',generationId:'run-1'}));
test('originais são preservados e não tornam o produto pronto',()=>{
 const state=source(); assert.equal(state.assets.length,4);assert.equal(studioReadiness(state,'p').ready,false);
 assert.deepEqual(ingestSupplierOriginals(state,'p',originalUrls,'AliExpress',at),state);
});
test('estúdio bloqueia sem provedor real e não modifica originais',async()=>{
 const state=source(); await assert.rejects(generateStudioPack(state,{productId:'p',title:'Item',technicalDescription:''},null,at),/gateway/);assert.equal(state.assets.length,4);
});
test('quatro fotos verificadas e distintas ficam prontas sem substituir os originais',async()=>{
 const state=await generateStudioPack(source(),{productId:'p',title:'Item',technicalDescription:''},{name:'test',generateStudio:async req=>{assert.equal(req.references.length,4);return output();}},at);
 assert.equal(studioReadiness(state,'p').ready,true);assert.equal(approvedStudioAssets(state,'p').length,4);assert.equal(state.assets.filter(a=>a.kind==='ORIGINAL').length,4);
});
test('não aceita URL original, vista repetida ou fidelidade não verificada como pack comercial',async()=>{
 for(const mutate of [o=>o[0].url=originalUrls[0],o=>o[1].angle=o[0].angle,o=>o[0].fidelityVerified=false,o=>o[0].sourceAssetIds=['unknown'],o=>o[0].url='data:image/png;base64,bogus']) {
  const outputs=output();mutate(outputs);await assert.rejects(generateStudioPack(source(),{productId:'p',title:'Item',technicalDescription:''},{name:'test',generateStudio:async()=>outputs},at));
 }
});


test('reimportar fotos arquivadas não duplica originais',()=>{
 const state=source();
 const archived={...state,assets:state.assets.map(asset=>({...asset,sourceUrl:asset.url,url:'https://ddf.example/api/media?id='+asset.id}))};
 assert.deepEqual(ingestSupplierOriginals(archived,'p',originalUrls,'AliExpress',at),archived);
});

test('URL do fornecedor arquivada também não pode virar foto de estúdio',async()=>{const state=source();const archived={...state,assets:state.assets.map(asset=>({...asset,sourceUrl:asset.url,url:'https://ddf.example/api/media?id='+asset.id}))};const outputs=output();outputs[0].url=originalUrls[0];await assert.rejects(generateStudioPack(archived,{productId:'p',title:'Item',technicalDescription:''},{name:'test',generateStudio:async()=>outputs},at),/original apresentado/);});
