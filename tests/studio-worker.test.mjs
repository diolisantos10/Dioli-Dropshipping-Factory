import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import ts from 'typescript';
import * as mediaRules from '../src/lib/media-factory.ts';
import { recordMediaProductionResult, updateMediaProductionRequest } from '../src/lib/media-production-queue.ts';
import { GatewayError } from '../src/lib/ai-gateway.ts';
const require=createRequire(import.meta.url);

test('worker real limita concorrência, preserva originais e não gera produto arquivado',async t=>{
 const old=process.env.DDF_PUBLIC_URL;process.env.DDF_PUBLIC_URL='https://ddf.example';t.after(()=>{if(old===undefined)delete process.env.DDF_PUBLIC_URL;else process.env.DDF_PUBLIC_URL=old;});
 let media=structuredClone(mediaRules.emptyMedia);
 const products=Array.from({length:4},(_,i)=>({id:`p${i}`,status:'EM_PRODUCAO',universalTitle:'Óculos',...(i===0?{archivedAt:'2026-10-09T00:00:00Z'}:{})}));
 for(const p of products)media=mediaRules.ingestSupplierOriginals(media,p.id,[`https://ae01.alicdn.com/${p.id}.png`],'Supplier','2026-10-09T00:00:00Z');
 media.productionRequests=products.map((p,i)=>({id:`r${i}`,productId:p.id,status:'PENDENTE',updatedAt:`2026-10-09T00:00:0${i}Z`,sourceAssetIds:[`${p.id}-original-1`]}));
 let active=0,maxActive=0,generated=0,blobs=0;
 const connection={query:async sql=>({rows:[{acquired:sql.includes('try_advisory_lock')?true:undefined}]}),release:()=>{}};
 const deps={
  './server-state':{getDatabasePool:async()=>({connect:async()=>connection,query:async()=>{blobs++;return{rows:[]};}}),readState:async domain=>({payload:domain==='media'?media:{products}})},
  './command-runner':{runServerCommand:async(type,input)=>{media=type==='media.recordStudioResult'?recordMediaProductionResult(media,input.requestId,input.asset,input.approved,`generated-${generated++}`,new Date().toISOString()):updateMediaProductionRequest(media,input.requestId,input.status,new Date().toISOString(),input.error);return{payload:media};}},
  './media-factory':mediaRules,'./product-factory':{emptyProductFactory:{products:[]}},
  './ai-gateway':{GatewayError,gatewayConfigurationStatus:()=>({configured:true})},
  './studio-gateway':{STUDIO_ANGLES:['frontal','lateral','posterior','tres-quartos'],generateReviewedStudioImage:async input=>{
    assert.notEqual(input.productId,'p0');active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,10));active--;
    return{image:{base64:Buffer.from('png-bytes').toString('base64'),mimeType:'image/png',providerId:'openai',modelId:'image',generationId:input.productId},approved:true,evidence:'mesmo produto',reviewer:{providerId:'openai',modelId:'vision'}};
  }},
 };
 const code=ts.transpileModule(readFileSync(new URL('../src/lib/studio-worker.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const workerModule={exports:{}};
 new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name=>name.startsWith('node:')?require(name):deps[name],workerModule,workerModule.exports);
 const result=await workerModule.exports.runStudioProduction('c1');
 assert.equal(result.checked,3);assert.equal(result.generated,2);assert.equal(result.blocked,1);assert.equal(maxActive,2);assert.equal(blobs,2);
 assert.equal(media.assets.filter(a=>a.kind==='ORIGINAL').length,4);
 assert.equal(media.productionRequests.find(r=>r.productId==='p0').status,'BLOQUEADO');
 assert.equal(media.productionRequests.find(r=>r.productId==='p3').status,'PENDENTE');
 assert.equal(mediaRules.studioReadiness(media,'p1').ready,false);
});
