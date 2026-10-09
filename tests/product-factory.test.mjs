import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProductFactory, markProductReady, productGaps, productVersionDiff, restoreProductVersion, startProduct, updateProduct } from '../src/lib/product-factory.ts';

const approved = { id: 'candidate-1', name: 'Produto teste', url: 'https://example.com/', notes: 'Origem controlada', status: 'APROVADO', createdAt: '2026-01-01T00:00:00Z' };

test('produção só começa com candidato aprovado e não duplica cadastro mestre', () => {
  assert.throws(() => startProduct(emptyProductFactory, { ...approved, status: 'TRIADO' }, 'p1', 'now'), /Somente candidatos aprovados/);
  const state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  assert.equal(state.products[0].status, 'EM_PRODUCAO');
  assert.throws(() => startProduct(state, approved, 'p2', 'now'), /já possui/);
});

test('schema universal e restauração preservam histórico', () => {
  let state = startProduct(emptyProductFactory, approved, 'p-history', '2026-01-01T00:00:00Z');
  state = updateProduct(state, 'p-history', { universalTitle: 'Produto Universal', shortDescription: 'Curta', longDescription: 'Longa', category: 'Casa', bullets: ['a','b','c'], benefits: ['a','b'], tags: ['tag'], spec: { variants: [{ id: 'v1', sku: 'SKU-1', title: 'Padrão', gtin: '7890000000000', attributes: { cor: 'Preto' }, dimensions: { lengthCm: 10, widthCm: 5, heightCm: 2 }, weightGrams: 100 }], materials: ['Resina'], colors: ['Preto'], sizes: ['Único'], seo: { title: 'SEO', description: 'Descrição' }, compliance: { notes: 'Revisado', certifications: [] }, localizations: { 'pt-BR': { title: 'Produto', description: 'Descrição' } }, destinationGaps: { marketplace: ['Categoria externa'] } } }, '2026-01-01T00:01:00Z');
  assert.equal(state.products[0].spec.variants[0].sku, 'SKU-1');
  state = updateProduct(state, 'p-history', { universalTitle: 'Alterado', shortDescription: 'Curta', longDescription: 'Longa', category: 'Casa', bullets: ['a','b','c'], benefits: ['a','b'], tags: ['tag'] }, '2026-01-01T00:02:00Z');
  state = restoreProductVersion(state, 'p-history', 2, '2026-01-01T00:03:00Z');
  assert.equal(state.products[0].universalTitle, 'Produto Universal');
  assert.equal(state.products[0].version, 4);
});

test('produto incompleto não pode ser marcado como pronto', () => {
  const state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  assert.ok(productGaps(state.products[0]).length > 0);
  assert.throws(() => markProductReady(state, 'p1', 'later', 0), /Complete antes/);
});

test('cadastro completo gera versão pronta sem fornecedor ou publicação', () => {
  let state = startProduct(emptyProductFactory, approved, 'p1', 'now');
  state = updateProduct(state, 'p1', { universalTitle: 'Título', category: 'Casa', shortDescription: 'Descrição curta', longDescription: 'Descrição completa', bullets: ['Um', 'Dois', 'Três'], benefits: ['Benefício A', 'Benefício B'], tags: ['casa'], spec:{variants:[],materials:['Resina'],colors:[],sizes:[],seo:{title:'Título',description:'Descrição'},compliance:{notes:'',certifications:[]},localizations:{},destinationGaps:{},technical:{dimensions:{lengthCm:10,widthCm:5,heightCm:2},weightGrams:100,packageDimensions:{lengthCm:null,widthCm:null,heightCm:null},packageWeightGrams:null,model:'',brand:'',features:[],specifications:{},careInstructions:'',includedItems:[],additionalFields:{}}} }, 'later');
  assert.throws(() => markProductReady(state, 'p1', 'finish', 0), /mídia/);
  state = markProductReady(state, 'p1', 'finish', 4);
  assert.equal(state.products[0].status, 'PRONTO');
  assert.equal(state.products[0].version, 3);
  assert.equal('supplierOffer' in state.products[0], false);
  assert.equal('published' in state.products[0], false);
});
test('comparação de versões informa campos alterados',()=>{let state=startProduct(emptyProductFactory,approved,'diff','2026-01-01T00:00:00Z');const before=state.products[0];state=updateProduct(state,'diff',{universalTitle:'Novo título',category:'Casa',shortDescription:'Curta',longDescription:'Longa',bullets:['1','2','3'],benefits:['1','2'],tags:['nova']},'2026-01-01T00:01:00Z');const changes=productVersionDiff(before,state.products[0]);assert.ok(changes.some(item=>item.field==='Título'&&item.after==='Novo título'));assert.ok(changes.some(item=>item.field==='Categoria'))});


test('produção herda dados técnicos e imagens do fornecedor sem estimar medidas ausentes',()=>{
  const candidate={...approved,category:'Óculos',supplier:{name:'Loja',ref:'1',cost:20,currency:'BRL',stock:3,imageUrl:'https://example.com/front.jpg',images:['https://example.com/back.jpg'],variants:[],description:'Descrição integral do fornecedor',specifications:{Lente:'Polarizada'},materials:['Acetato'],features:['Proteção informada pelo fornecedor'],weightGrams:35,packageDimensions:{lengthCm:20,widthCm:10,heightCm:5}}};
  const product=startProduct(emptyProductFactory,candidate,'inherit','now').products[0];
  assert.equal(product.longDescription,candidate.supplier.description);
  assert.deepEqual(product.spec.materials,['Acetato']);
  assert.equal(product.spec.technical.weightGrams,35);
  assert.equal(product.spec.technical.dimensions.lengthCm,null);
  assert.equal(product.spec.technical.packageDimensions.lengthCm,20);
  assert.equal(product.spec.sourceImages.length,2);
  assert.ok(productGaps(product).includes('Dimensões confirmadas de cada item'));
});

test('peso geral não é copiado para múltiplas variações de tamanho sem confirmação',()=>{
 const supplier={name:'Loja',ref:'1',cost:20,currency:'BRL',stock:3,imageUrl:'',images:[],variants:[{sku:'P',label:'P',price:20,stock:1},{sku:'G',label:'G',price:20,stock:1}],weightGrams:100,dimensions:{lengthCm:10,widthCm:5,heightCm:2}};
 const product=startProduct(emptyProductFactory,{...approved,supplier},'variants','now').products[0];
 assert.ok(product.spec.variants.every(variant=>variant.weightGrams===null&&variant.dimensions.lengthCm===null));
});
