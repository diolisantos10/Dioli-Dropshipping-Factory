import test from 'node:test'; import assert from 'node:assert/strict';
import { addMedia, completeTransformation, emptyMedia, enqueueTransformation, hasApprovedMedia, reviewMedia, updateTransformationJob } from '../src/lib/media-factory.ts';
test('mídia exige origem e revisão explícita', () => {
  assert.throws(() => addMedia(emptyMedia, { productId: 'p1', url: 'javascript:x', kind: 'ORIGINAL', purpose: 'Principal', provenance: 'Fonte' }, 'm1', 'now'));
  let state = addMedia(emptyMedia, { productId: 'p1', url: 'https://example.com/image.jpg', kind: 'ORIGINAL', purpose: 'Principal', provenance: 'Fornecedor controlado' }, 'm1', 'now');
  assert.equal(hasApprovedMedia(state, 'p1'), false); state = reviewMedia(state, 'm1', 'APROVADA'); assert.equal(hasApprovedMedia(state, 'p1'), true);
});
test('mídias são versionadas por produto e finalidade', () => {
  let state=addMedia(emptyMedia,{productId:'p1',url:'https://example.com/a.jpg',kind:'ORIGINAL',purpose:'Principal',provenance:'Marca',rightsStatus:'DECLARADO'},'m1','2026-01-01T00:00:00Z');
  state=addMedia(state,{productId:'p1',url:'https://example.com/b.jpg',kind:'ORIGINAL',purpose:'Principal',provenance:'Marca',rightsStatus:'DECLARADO'},'m2','2026-01-02T00:00:00Z');
  assert.equal(state.assets[0].version,2);assert.equal(state.assets[1].version,1);
});
test('direitos inválidos impedem aprovação',()=>{
  const state=addMedia(emptyMedia,{productId:'p1',url:'https://example.com/a.jpg',kind:'ORIGINAL',purpose:'Principal',provenance:'Fonte',rightsStatus:'DESCONHECIDO'},'m1','2026-01-01T00:00:00Z');
  assert.throws(()=>reviewMedia(state,'m1','APROVADA'),/direitos/);
});
test('job exige original aprovado e cria derivada comparável',()=>{
  let state=addMedia(emptyMedia,{productId:'p1',url:'https://example.com/a.jpg',kind:'ORIGINAL',purpose:'Principal',provenance:'Marca',rightsStatus:'DECLARADO'},'m1','2026-01-01T00:00:00Z');
  assert.throws(()=>enqueueTransformation(state,{id:'j1',productId:'p1',sourceAssetId:'m1',kind:'REENQUADRAR',destination:'Instagram',format:'WEBP',aspectRatio:'4:5'},'now'),/aprovado/);
  state=reviewMedia(state,'m1','APROVADA');state=enqueueTransformation(state,{id:'j1',productId:'p1',sourceAssetId:'m1',kind:'REENQUADRAR',destination:'Instagram',format:'WEBP',aspectRatio:'4:5'},'2026-01-01T01:00:00Z');
  state=updateTransformationJob(state,'j1','PROCESSANDO','2026-01-01T01:01:00Z');
  state=completeTransformation(state,'j1',{url:'https://example.com/a-45.webp',purpose:'Principal social',provenance:'Pipeline DDF',rightsStatus:'DECLARADO',transformationNotes:'Corte central sem alterar o produto'},'m2','2026-01-01T01:02:00Z');
  assert.equal(state.jobs[0].status,'CONCLUIDO');assert.equal(state.assets[0].originalAssetId,'m1');assert.equal(state.assets[0].aspectRatio,'4:5');
  state=reviewMedia(state,'m2','APROVADA');assert.equal(state.assets[0].status,'APROVADA');
});
test('guardrail bloqueia derivada com aparência enganosa',()=>{
  let state=addMedia(emptyMedia,{productId:'p1',url:'https://example.com/a.jpg',kind:'ORIGINAL',purpose:'Principal',provenance:'Marca',rightsStatus:'DECLARADO'},'m1','2026-01-01T00:00:00Z');state=reviewMedia(state,'m1','APROVADA');
  state=enqueueTransformation(state,{id:'j1',productId:'p1',sourceAssetId:'m1',kind:'OTIMIZAR',destination:'Loja',format:'WEBP',aspectRatio:'1:1'},'2026-01-01T01:00:00Z');
  state=completeTransformation(state,'j1',{url:'https://example.com/fake.webp',purpose:'Principal',provenance:'Pipeline',rightsStatus:'DECLARADO',transformationNotes:'Alteração de cor',changesProductAppearance:true},'m2','2026-01-01T01:02:00Z');
  assert.equal(state.jobs[0].status,'BLOQUEADO');assert.throws(()=>reviewMedia(state,'m2','APROVADA'),/enganosa/);
});
