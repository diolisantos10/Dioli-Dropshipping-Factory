import test from 'node:test';
import assert from 'node:assert/strict';
import { addSupplierOffer, assignProduct, catalogReadiness, catalogRecords, emptyCatalog, filterCatalog, upsertParty } from '../src/lib/catalog.ts';

const product = { id:'p1',candidateId:'c1',status:'PRONTO',version:3,universalTitle:'Óculos Solar',shortDescription:'Proteção diária',longDescription:'Produto universal',category:'Moda > Acessórios',bullets:['a','b','c'],benefits:['a','b'],tags:['uv400'],spec:{variants:[{id:'v1',sku:'SOL-01',title:'Preto',gtin:'',attributes:{cor:'preto'},dimensions:{lengthCm:12,widthCm:4,heightCm:3},weightGrams:30}],materials:['resina'],colors:['preto'],sizes:[],seo:{title:'',description:''},compliance:{notes:'',certifications:[]},localizations:{},destinationGaps:{marketplace:['GTIN ausente']}},createdAt:'now',updatedAt:'now' };

const original={id:'original',productId:'p1',url:'https://example.com/original.jpg',kind:'ORIGINAL',purpose:'Fonte',provenance:'Fornecedor',status:'APROVADA',createdAt:'now'};
const media=[original,...['frente','trás','lado','detalhe'].map((studioAngle,index)=>({id:`studio-${index}`,productId:'p1',url:`https://example.com/studio-${index}.jpg`,kind:'DERIVADA',purpose:'Estúdio',provenance:'Fonte',status:'APROVADA',createdAt:'now',originalAssetId:'original',studio:true,studioAngle,fidelityVerified:true,fidelityEvidence:'Conferência com original',mimeType:'image/jpeg'}))];

test('catálogo contém apenas produtos prontos e agrega dimensões relacionadas',()=>{let state=upsertParty(emptyCatalog,'store',{id:'loja-1',name:'Loja 1',active:true});state=assignProduct(state,'p1',{brandIds:['dilix','dilix'],storeIds:['loja-1'],destinations:['marketplace']},'now');state=addSupplierOffer(state,{productId:'p1',supplierName:'Fornecedor neutro',supplierRef:'A-1',cost:20,currency:'brl',stock:5,leadTimeDays:3},'o1','now');const draft={...product,id:'p2',status:'EM_PRODUCAO'};const records=catalogRecords(state,[product,draft],media,[],[]);assert.equal(records.length,1);assert.equal(records[0].brands[0].name,'Dilix');assert.equal(records[0].stores[0].name,'Loja 1');assert.equal(records[0].offers[0].currency,'BRL');assert.deepEqual(records[0].assignment.brandIds,['dilix']);});
test('filtros combinam busca, taxonomia, marca, loja, destino e gaps',()=>{let state=upsertParty(emptyCatalog,'store',{id:'loja-1',name:'Loja 1',active:true});state=assignProduct(state,'p1',{brandIds:['dilix'],storeIds:['loja-1'],destinations:['marketplace']},'now');const records=catalogRecords(state,[product],media,[],[]);assert.equal(filterCatalog(records,{query:'SOL-01',category:'Moda > Acessórios',brandId:'dilix',storeId:'loja-1',destination:'marketplace',gapsOnly:true}).length,1);assert.equal(filterCatalog(records,{query:'inexistente'}).length,0);});
test('oferta inválida ou duplicada é bloqueada',()=>{const input={productId:'p1',supplierName:'Fornecedor',supplierRef:'A-1',cost:20,currency:'BRL',stock:2,leadTimeDays:1};const state=addSupplierOffer(emptyCatalog,input,'o1','now');assert.throws(()=>addSupplierOffer(state,input,'o2','later'),/já existe/);assert.throws(()=>addSupplierOffer(emptyCatalog,{...input,cost:-1},'o1','now'),/valores válidos/);});

test('legado marcado pronto não entra no catálogo sem cadastro técnico e quatro ângulos aprovados',()=>{
  assert.equal(catalogRecords(emptyCatalog,[product],[],[],[]).length,0);
  assert.equal(catalogRecords(emptyCatalog,[product],media.slice(0,4),[],[]).length,0);
  const missingWeight={...product,spec:{...product.spec,variants:[{...product.spec.variants[0],weightGrams:null}]}};
  assert.equal(catalogReadiness(missingWeight,media).ready,false);
  assert.equal(catalogRecords(emptyCatalog,[missingWeight],media,[],[]).length,0);
  assert.equal(catalogReadiness(product,media).ready,true);
});
test('seleção manual registra destino sem criar publicação ou cálculo de preço',()=>{
  const state=assignProduct(emptyCatalog,'p1',{brandIds:['santioh'],storeIds:['loja'],destinations:['shopify']},'now');
  const record=catalogRecords(state,[product],media,[],[])[0];
  assert.deepEqual(record.assignment.storeIds,['loja']);
  assert.deepEqual(record.prices,[]);
  assert.equal('publishing' in state,false);
});
