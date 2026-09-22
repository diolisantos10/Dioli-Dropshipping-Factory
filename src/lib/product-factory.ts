import type { Candidate } from './intake';

export type MasterProductStatus = 'EM_PRODUCAO' | 'PRONTO';
export type ProductVariant = { id:string; sku:string; title:string; gtin:string; attributes:Record<string,string>; dimensions:{lengthCm:number|null;widthCm:number|null;heightCm:number|null}; weightGrams:number|null };
export type UniversalProductSpec = { variants:ProductVariant[]; materials:string[]; colors:string[]; sizes:string[]; seo:{title:string;description:string}; compliance:{notes:string;certifications:string[]}; localizations:Record<string,{title:string;description:string}>; destinationGaps:Record<string,string[]> };
export type MasterProduct = {
  id: string; candidateId: string; status: MasterProductStatus; version: number;
  universalTitle: string; shortDescription: string; longDescription: string;
  category: string; bullets: string[]; benefits: string[]; tags: string[];
  spec?: UniversalProductSpec;
  createdAt: string; updatedAt: string;
};
export type ProductEvent = { id: string; productId: string; action: 'PRODUCAO_INICIADA' | 'RASCUNHO_ATUALIZADO' | 'PRODUTO_PRONTO' | 'VERSAO_RESTAURADA'; at: string; actor: string; version: number };
export type ProductVersionSnapshot={productId:string;version:number;snapshot:MasterProduct;at:string;actor:string};
export type ProductFactoryState = { version: 1; products: MasterProduct[]; events: ProductEvent[]; versions?:ProductVersionSnapshot[] };
export const PRODUCT_STORAGE_KEY = 'ddf.products.demo.v1';
export const emptyProductFactory: ProductFactoryState = { version: 1, products: [], events: [] };
export const emptyUniversalSpec:UniversalProductSpec={variants:[],materials:[],colors:[],sizes:[],seo:{title:'',description:''},compliance:{notes:'',certifications:[]},localizations:{},destinationGaps:{}};

export function productGaps(product: MasterProduct) {
  const gaps: string[] = [];
  if (!product.universalTitle.trim()) gaps.push('Título universal');
  if (!product.category.trim()) gaps.push('Categoria');
  if (!product.shortDescription.trim()) gaps.push('Descrição curta');
  if (!product.longDescription.trim()) gaps.push('Descrição longa');
  if (product.bullets.filter(Boolean).length < 3) gaps.push('3 bullets comerciais');
  if (product.benefits.filter(Boolean).length < 2) gaps.push('2 benefícios');
  return gaps;
}
export function startProduct(state: ProductFactoryState, candidate: Candidate, id: string, at: string): ProductFactoryState {
  if (candidate.status !== 'APROVADO') throw new Error('Somente candidatos aprovados podem entrar na Product Factory.');
  if (state.products.some(p => p.candidateId === candidate.id)) throw new Error('Este candidato já possui um cadastro mestre.');
  const product: MasterProduct = { id, candidateId: candidate.id, status: 'EM_PRODUCAO', version: 1, universalTitle: candidate.name, shortDescription: '', longDescription: candidate.notes, category: '', bullets: [], benefits: [], tags: [], spec:emptyUniversalSpec, createdAt: at, updatedAt: at };
  return { ...state, products: [product, ...state.products], events: [{ id: `${id}:1`, productId: id, action: 'PRODUCAO_INICIADA', at, actor: 'Aprovador · controlado', version: 1 }, ...state.events],versions:[{productId:id,version:1,snapshot:product,at,actor:'Aprovador · controlado'},...(state.versions??[])] };
}
export function updateProduct(state: ProductFactoryState, id: string, input: Pick<MasterProduct, 'universalTitle'|'shortDescription'|'longDescription'|'category'|'bullets'|'benefits'|'tags'> & {spec?:UniversalProductSpec}, at: string): ProductFactoryState {
  const current = state.products.find(p => p.id === id);
  if (!current || current.status === 'PRONTO') throw new Error('Este cadastro não está disponível para edição.');
  const clean = (values: string[]) => values.map(v => v.trim()).filter(Boolean);
  const version = current.version + 1;
  const next = { ...current, ...input, spec:input.spec??current.spec??emptyUniversalSpec, universalTitle: input.universalTitle.trim(), shortDescription: input.shortDescription.trim(), longDescription: input.longDescription.trim(), category: input.category.trim(), bullets: clean(input.bullets), benefits: clean(input.benefits), tags: clean(input.tags), version, updatedAt: at };
  return { ...state, products: state.products.map(p => p.id === id ? next : p), events: [{ id: `${id}:${version}`, productId: id, action: 'RASCUNHO_ATUALIZADO', at, actor: 'Aprovador · controlado', version }, ...state.events],versions:[{productId:id,version,snapshot:next,at,actor:'Aprovador · controlado'},...(state.versions??[])] };
}
export function markProductReady(state: ProductFactoryState, id: string, at: string, approvedMedia: boolean): ProductFactoryState {
  const current = state.products.find(p => p.id === id);
  if (!current || current.status !== 'EM_PRODUCAO') throw new Error('Produto indisponível para conclusão.');
  const gaps = productGaps(current); if (gaps.length) throw new Error(`Complete antes de finalizar: ${gaps.join(', ')}.`);
  if (!approvedMedia) throw new Error('Aprove ao menos uma mídia na Media Factory antes de finalizar.');
  const version = current.version + 1;
  const ready={...current,status:'PRONTO' as const,version,updatedAt:at};
  return { ...state, products: state.products.map(p => p.id === id ? ready : p), events: [{ id: `${id}:${version}`, productId: id, action: 'PRODUTO_PRONTO', at, actor: 'Aprovador · controlado', version }, ...state.events],versions:[{productId:id,version,snapshot:ready,at,actor:'Aprovador · controlado'},...(state.versions??[])] };
}
export function restoreProductVersion(state:ProductFactoryState,id:string,sourceVersion:number,at:string):ProductFactoryState{const current=state.products.find(product=>product.id===id);const source=(state.versions??[]).find(item=>item.productId===id&&item.version===sourceVersion);if(!current||!source||current.status==='PRONTO')throw new Error('Versão indisponível para restauração.');const version=current.version+1;const restored={...source.snapshot,status:'EM_PRODUCAO' as const,version,updatedAt:at};return{...state,products:state.products.map(product=>product.id===id?restored:product),events:[{id:`${id}:${version}`,productId:id,action:'VERSAO_RESTAURADA',at,actor:'Aprovador · controlado',version},...state.events],versions:[{productId:id,version,snapshot:restored,at,actor:'Aprovador · controlado'},...(state.versions??[])]}}

export type ProductChange = { field: string; before: string; after: string };
export function productVersionDiff(before: MasterProduct, after: MasterProduct): ProductChange[] {
  const fields: Array<[string, unknown, unknown]> = [
    ['Título', before.universalTitle, after.universalTitle], ['Categoria', before.category, after.category],
    ['Descrição curta', before.shortDescription, after.shortDescription], ['Descrição longa', before.longDescription, after.longDescription],
    ['Bullets', before.bullets, after.bullets], ['Benefícios', before.benefits, after.benefits], ['Tags', before.tags, after.tags],
    ['Schema universal', before.spec ?? emptyUniversalSpec, after.spec ?? emptyUniversalSpec],
  ];
  const display = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value);
  return fields.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b)).map(([field, a, b]) => ({ field, before: display(a), after: display(b) }));
}
