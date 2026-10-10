import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import ts from 'typescript';
import * as mediaRules from '../src/lib/media-factory.ts';
import { checkpointStudioAssessment, recordMediaProductionResult, updateMediaProductionRequest } from '../src/lib/media-production-queue.ts';
import { GatewayError } from '../src/lib/ai-gateway.ts';
const require=createRequire(import.meta.url);
const archiveModule={exports:{}};
const archiveCode=ts.transpileModule(readFileSync(new URL('../src/lib/supplier-media-archive.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Script(`(function(require,module,exports){${archiveCode}\n})`).runInThisContext()(name=>name.startsWith('node:')?require(name):{},archiveModule,archiveModule.exports);

test('single-product studio target leaves unrelated pending and stale paid requests untouched',async()=>{
 const requests=[{id:'other-pending',productId:'other',status:'PENDENTE',updatedAt:'2020-01-01T00:00:00Z'},
   {id:'other-stale',productId:'other',status:'PROCESSANDO',updatedAt:'2020-01-01T00:00:00Z'}];
 const connection={query:async()=>({rows:[{acquired:true}]}),release:()=>{}};
 const deps={
  './server-state':{getDatabasePool:async()=>({connect:async()=>connection}),readState:async()=>({payload:{assets:[],productionRequests:requests}})},
  './command-runner':{runServerCommand:async()=>assert.fail('Unrelated queue must not be mutated')},
  './media-factory':mediaRules,'./product-factory':{},'./studio-gateway':{},'./ai-gateway':{},
  './supplier-media-archive':archiveModule.exports,
 };
 const code=ts.transpileModule(readFileSync(new URL('../src/lib/studio-worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const workerModule={exports:{}};
 new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name=>name.startsWith('node:')?require(name):deps[name],workerModule,workerModule.exports);
 assert.equal((await workerModule.exports.runStudioProduction('pilot',['selected'])).checked,0);
 assert.equal(requests[0].status,'PENDENTE');
 assert.equal(requests[1].status,'PROCESSANDO');
});

test('fully inspected gallery without angle support stops before generation with precise unsupported-view code',async t=>{
 const old=process.env.DDF_PUBLIC_URL;process.env.DDF_PUBLIC_URL='https://ddf.example';t.after(()=>{if(old===undefined)delete process.env.DDF_PUBLIC_URL;else process.env.DDF_PUBLIC_URL=old;});
 let media=mediaRules.ingestSupplierOriginals(structuredClone(mediaRules.emptyMedia),'pilot',['https://ae01.alicdn.com/a.png'],'Supplier','2026-10-09T00:00:00Z');
 const id=media.assets[0].id;
 media.productionRequests=[{id:'r',productId:'pilot',status:'PENDENTE',updatedAt:'2026-10-09T00:00:00Z',sourceAssetIds:[id],sourceAssessment:{angle:'frontal',variantIdentity:'preto',processedSourceAssetIds:[id],supportedSourceAssetIds:[],evidence:['Ângulo não disponível']}}];
 const connection={query:async()=>({rows:[{acquired:true}]}),release:()=>{}};
 const deps={
 './server-state':{getDatabasePool:async()=>({connect:async()=>connection}),readState:async domain=>({payload:domain==='media'?media:{products:[{id:'pilot',status:'EM_PRODUCAO',universalTitle:'Óculos'}]}})},
 './command-runner':{runServerCommand:async(_type,input)=>{media=updateMediaProductionRequest(media,input.requestId,input.status,new Date().toISOString(),input.error);return{payload:media};}},
 './media-factory':mediaRules,'./product-factory':{},'./supplier-media-archive':archiveModule.exports,
 './ai-gateway':{GatewayError,gatewayConfigurationStatus:()=>({configured:true})},
 './studio-gateway':{STUDIO_ANGLES:['frontal'],assessStudioSourceBatch:async()=>assert.fail('Checkpointed sources cannot be reread'),generateReviewedStudioImage:async()=>assert.fail('Unseen angle cannot be generated')},
 };
 const code=ts.transpileModule(readFileSync(new URL('../src/lib/studio-worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const workerModule={exports:{}};
 new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name=>name.startsWith('node:')?require(name):deps[name],workerModule,workerModule.exports);
 const result=await workerModule.exports.runStudioProduction('pilot',['pilot']);
 assert.equal(result.failed,1);assert.equal(result.results[0].code,'studio_unsupported_view');assert.equal(media.productionRequests[0].status,'FALHOU');
});

test('worker real limita concorrência, preserva originais e não gera produto arquivado',async t=>{
 const old=process.env.DDF_PUBLIC_URL;process.env.DDF_PUBLIC_URL='https://ddf.example';t.after(()=>{if(old===undefined)delete process.env.DDF_PUBLIC_URL;else process.env.DDF_PUBLIC_URL=old;});
 let media=structuredClone(mediaRules.emptyMedia);
 const products=Array.from({length:4},(_,i)=>({id:`p${i}`,status:'EM_PRODUCAO',universalTitle:'Óculos',...(i===0?{archivedAt:'2026-10-09T00:00:00Z'}:{})}));
 for(const p of products)media=mediaRules.ingestSupplierOriginals(media,p.id,[`https://ae-pic-a1.aliexpress-media.com/${p.id}.png`],'Supplier','2026-10-09T00:00:00Z');
 media.productionRequests=products.map((p,i)=>({id:`r${i}`,productId:p.id,status:'PENDENTE',updatedAt:`2026-10-09T00:00:0${i}Z`,sourceAssetIds:[`${p.id}-original-1`]}));
 let active=0,maxActive=0,generated=0,blobs=0;
 const connection={query:async sql=>({rows:[{acquired:sql.includes('try_advisory_lock')?true:undefined}]}),release:()=>{}};
 const deps={
  './server-state':{getDatabasePool:async()=>({connect:async()=>connection,query:async(_sql,values)=>{blobs++;assert.match(values[1],/\.jpg$/);assert.equal(values[2],'image/jpeg');return{rows:[]};}}),readState:async domain=>({payload:domain==='media'?media:{products}})},
  './command-runner':{runServerCommand:async(type,input)=>{media=type==='media.checkpointStudioAssessment'?checkpointStudioAssessment(media,input.requestId,input,new Date().toISOString()):type==='media.recordStudioResult'?recordMediaProductionResult(media,input.requestId,input.asset,input.approved,`generated-${generated++}`,new Date().toISOString()):updateMediaProductionRequest(media,input.requestId,input.status,new Date().toISOString(),input.error);return{payload:media};}},
  './media-factory':mediaRules,'./product-factory':{emptyProductFactory:{products:[]}},
  './supplier-media-archive':archiveModule.exports,
  './ai-gateway':{GatewayError,gatewayConfigurationStatus:()=>({configured:true})},
  './studio-gateway':{STUDIO_ANGLES:['frontal','lateral','posterior','tres-quartos'],assessStudioSourceBatch:async()=>({supportedIndices:[1],variantIdentity:'preto',evidence:'Frontal preto'}),generateReviewedStudioImage:async input=>{
    assert.notEqual(input.productId,'p0');active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,10));active--;
    return{image:{base64:Buffer.from('jpeg-bytes').toString('base64'),mimeType:'image/jpeg',providerId:'xai',modelId:'image',generationId:input.productId},approved:true,evidence:'mesmo produto',reviewer:{providerId:'xai',modelId:'vision'}};
  }},
 };
 const code=ts.transpileModule(readFileSync(new URL('../src/lib/studio-worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const workerModule={exports:{}};
 new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name=>name.startsWith('node:')?require(name):deps[name],workerModule,workerModule.exports);
 const result=await workerModule.exports.runStudioProduction('c1');
 assert.equal(result.checked,3);assert.equal(result.generated,2);assert.equal(result.blocked,1);assert.equal(maxActive,2);assert.equal(blobs,2);
 assert.equal(media.assets.filter(a=>a.kind==='ORIGINAL').length,4);
 assert.ok(media.assets.filter(a=>a.kind==='DERIVADA').every(a=>a.format==='JPEG'&&a.mimeType==='image/jpeg'));
 assert.equal(media.productionRequests.find(r=>r.productId==='p0').status,'BLOQUEADO');
 assert.equal(media.productionRequests.find(r=>r.productId==='p3').status,'PENDENTE');
 assert.equal(mediaRules.studioReadiness(media,'p1').ready,false);
});

test('galerias grandes retomam checkpoints e nunca geram antes de ler todas as fotos, no máximo 45 por ciclo',async t=>{
 const old=process.env.DDF_PUBLIC_URL;process.env.DDF_PUBLIC_URL='https://ddf.example';t.after(()=>{if(old===undefined)delete process.env.DDF_PUBLIC_URL;else process.env.DDF_PUBLIC_URL=old;});
 let media=structuredClone(mediaRules.emptyMedia);
 const products=Array.from({length:3},(_,i)=>({id:`large${i}`,status:'EM_PRODUCAO',universalTitle:'Óculos preto'}));
 for(const p of products)media=mediaRules.ingestSupplierOriginals(media,p.id,Array.from({length:31},(_,i)=>`https://ae01.alicdn.com/${p.id}-${i}.png`),'Supplier','2026-10-09T00:00:00Z');
 media.productionRequests=products.map((p,i)=>({id:`large-r${i}`,productId:p.id,status:'PENDENTE',updatedAt:`2026-10-09T00:00:0${i}Z`,sourceAssetIds:media.assets.filter(a=>a.productId===p.id).map(a=>a.id)}));
 let inspected=0,generated=0;
 const seen=new Map();
 const connection={query:async()=>({rows:[{acquired:true}]}),release:()=>{}};
 const deps={
 './server-state':{getDatabasePool:async()=>({connect:async()=>connection,query:async()=>({rows:[]})}),readState:async domain=>({payload:domain==='media'?media:{products}})},
 './command-runner':{runServerCommand:async(type,input)=>{media=type==='media.checkpointStudioAssessment'?checkpointStudioAssessment(media,input.requestId,input,new Date().toISOString()):type==='media.recordStudioResult'?recordMediaProductionResult(media,input.requestId,input.asset,input.approved,`generated-${generated}`,new Date().toISOString()):updateMediaProductionRequest(media,input.requestId,input.status,new Date().toISOString(),input.error);return{payload:media};}},
 './media-factory':mediaRules,'./product-factory':{emptyProductFactory:{products:[]}},
 './supplier-media-archive':archiveModule.exports,
 './ai-gateway':{GatewayError,gatewayConfigurationStatus:()=>({configured:true})},
 './studio-gateway':{STUDIO_ANGLES:['frontal','lateral','posterior','tres-quartos'],assessStudioSourceBatch:async input=>{assert.ok(input.references.length<=15);inspected+=input.references.length;const prior=seen.get(input.productId)??new Set();for(const url of input.references){assert.equal(prior.has(url),false,'Fotos já lidas não são cobradas novamente no mesmo ângulo');prior.add(url);}seen.set(input.productId,prior);return{supportedIndices:[1],variantIdentity:'preto',evidence:'Fonte fiel frontal'};},generateReviewedStudioImage:async input=>{assert.equal(seen.get(input.productId).size,31);assert.equal(input.sourceVerified,true);assert.equal(input.variantIdentity,'preto');generated++;return{image:{base64:Buffer.from(input.productId).toString('base64'),mimeType:'image/png',providerId:'openai',modelId:'image',generationId:input.productId},approved:true,evidence:'Produto fiel',reviewer:{providerId:'openai',modelId:'vision'}};}},
 };
 const code=ts.transpileModule(readFileSync(new URL('../src/lib/studio-worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const workerModule={exports:{}};
 new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name=>name.startsWith('node:')?require(name):deps[name],workerModule,workerModule.exports);
 for(let run=0;run<3;run++){inspected=0;const result=await workerModule.exports.runStudioProduction('large-gallery');assert.ok(inspected<=45);assert.equal(result.failed,0);if(run<2){assert.equal(generated,0);assert.ok(media.productionRequests.every(r=>r.status==='PENDENTE'));}}
 assert.equal(generated,3);assert.ok(media.productionRequests.every(r=>r.sourceAssessment.processedSourceAssetIds.length===31));
 assert.equal(media.assets.filter(a=>a.kind==='ORIGINAL').length,93);
});
