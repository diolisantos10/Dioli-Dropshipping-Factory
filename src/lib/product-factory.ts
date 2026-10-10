import type { Candidate } from './intake';
import type { ProductCompletionRequest } from './product-completion-queue.ts';
import { normalizeFiscal, normalizeVariantLogistics, type Availability, type ProductFiscal, type VariantLogistics } from './product-fiscal.ts';

export type MasterProductStatus = 'EM_PRODUCAO' | 'PRONTO';
export type ProductVariant = { id:string; sku:string; title:string; gtin:string; attributes:Record<string,string>; dimensions:{lengthCm:number|null;widthCm:number|null;heightCm:number|null}; weightGrams:number|null };
export type ProductTechnical = { dimensions:{lengthCm:number|null;widthCm:number|null;heightCm:number|null}; weightGrams:number|null; packageDimensions:{lengthCm:number|null;widthCm:number|null;heightCm:number|null}; packageWeightGrams:number|null; model:string; brand:string; features:string[]; specifications:Record<string,string>; careInstructions:string; includedItems:string[]; additionalFields:Record<string,string> };
export const emptyTechnical:ProductTechnical={dimensions:{lengthCm:null,widthCm:null,heightCm:null},weightGrams:null,packageDimensions:{lengthCm:null,widthCm:null,heightCm:null},packageWeightGrams:null,model:'',brand:'',features:[],specifications:{},careInstructions:'',includedItems:[],additionalFields:{}};
export type UniversalProductSpec = { technical?:ProductTechnical; sourceImages?:string[]; sourceUrl?:string; variants:ProductVariant[]; materials:string[]; colors:string[]; sizes:string[]; seo:{title:string;description:string}; compliance:{notes:string;certifications:string[]}; localizations:Record<string,{title:string;description:string}>; destinationGaps:Record<string,string[]> };
export type MasterProduct = {
  id: string; candidateId: string; status: MasterProductStatus; version: number; archivedAt?: string; archivedReason?: string;
  universalTitle: string; shortDescription: string; longDescription: string;
  category: string; bullets: string[]; benefits: string[]; tags: string[];
  spec?: UniversalProductSpec;
  // Optional first fiscal/logistics layer and stock model; see product-fiscal.ts.
  fiscal?: ProductFiscal; availability?: Availability;
  createdAt: string; updatedAt: string;
};
export type ProductEvent = { id: string; productId: string; action: 'PRODUCAO_INICIADA' | 'RASCUNHO_ATUALIZADO' | 'PRODUTO_PRONTO' | 'VERSAO_RESTAURADA' | 'DADOS_FISCAIS_ATUALIZADOS' | 'DISPONIBILIDADE_ALTERADA' | 'PRODUTO_ARQUIVADO'; at: string; actor: string; version: number; reason?: string };
export type ProductVersionSnapshot={productId:string;version:number;snapshot:MasterProduct;at:string;actor:string};
export type ProductFactoryState = { version: 1; products: MasterProduct[]; events: ProductEvent[]; versions?:ProductVersionSnapshot[]; completionRequests?:ProductCompletionRequest[] };
export const PRODUCT_STORAGE_KEY = 'ddf.products.demo.v1';
export const emptyProductFactory: ProductFactoryState = { version: 1, products: [], events: [] };
export const emptyUniversalSpec:UniversalProductSpec={variants:[],materials:[],colors:[],sizes:[],seo:{title:'',description:''},compliance:{notes:'',certifications:[]},localizations:{},destinationGaps:{}};

export function productGaps(product: MasterProduct) {
  const gaps: string[] = [];
  if (!product.universalTitle.trim()) gaps.push('Título universal');
  if (!product.category.trim()) gaps.push('Categoria');
  if (!product.shortDescription.trim()) gaps.push('Descrição curta');
  if (!product.longDescription.trim()) gaps.push('Descrição longa');
  if (!product.spec?.materials?.some(value=>value.trim())) gaps.push('Material');
  const technical=product.spec?.technical;
  const variants=product.spec?.variants??[];
  const measured=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0;
  const validDimensions=(dimensions:ProductTechnical['dimensions']|undefined)=>!!dimensions&&measured(dimensions.lengthCm)&&measured(dimensions.widthCm)&&measured(dimensions.heightCm);
  if (!(variants.length ? variants.every(v=>measured(v.weightGrams)) : measured(technical?.weightGrams))) gaps.push('Peso confirmado de cada item');
  if (!(variants.length ? variants.every(v=>validDimensions(v.dimensions)) : validDimensions(technical?.dimensions))) gaps.push('Dimensões confirmadas de cada item');
  return gaps;
}
export function productCompletion(product:MasterProduct){const total=7;return Math.max(0,Math.round((total-productGaps(product).length)/total*100));}
export function startProduct(state: ProductFactoryState, candidate: Candidate, id: string, at: string, actor = 'Aprovador · controlado'): ProductFactoryState {
  if (candidate.status !== 'APROVADO') throw new Error('Somente candidatos aprovados podem entrar na Product Factory.');
  if (state.products.some(p => p.candidateId === candidate.id)) throw new Error('Este candidato já possui um cadastro mestre.');
  const supplier=candidate.supplier;
  const description=supplier?.description?.trim()||candidate.notes;
  const technical:ProductTechnical={...structuredClone(emptyTechnical),dimensions:{lengthCm:supplier?.dimensions?.lengthCm??null,widthCm:supplier?.dimensions?.widthCm??null,heightCm:supplier?.dimensions?.heightCm??null},weightGrams:supplier?.weightGrams??null,packageDimensions:{lengthCm:supplier?.packageDimensions?.lengthCm??null,widthCm:supplier?.packageDimensions?.widthCm??null,heightCm:supplier?.packageDimensions?.heightCm??null},packageWeightGrams:supplier?.packageWeightGrams??null,features:supplier?.features??[],specifications:supplier?.specifications??{}};
  const spec:UniversalProductSpec={...structuredClone(emptyUniversalSpec),technical,sourceUrl:candidate.url,sourceImages:[...new Set([...(supplier?.images??[]),supplier?.imageUrl??''].filter(Boolean))],materials:supplier?.materials??[],variants:(supplier?.variants??[]).map((variant,index)=>({id:`${id}:variant:${index}`,sku:variant.sku,title:variant.label,gtin:'',attributes:variant.attributes??{},dimensions:{lengthCm:variant.dimensions?.lengthCm??((supplier?.variants.length??0)<=1?technical.dimensions.lengthCm:null),widthCm:variant.dimensions?.widthCm??((supplier?.variants.length??0)<=1?technical.dimensions.widthCm:null),heightCm:variant.dimensions?.heightCm??((supplier?.variants.length??0)<=1?technical.dimensions.heightCm:null)},weightGrams:variant.weightGrams??((supplier?.variants.length??0)<=1?technical.weightGrams:null)})),seo:{title:candidate.fullName||candidate.name,description:description.slice(0,160)}};
  const product: MasterProduct = { id, candidateId: candidate.id, status: 'EM_PRODUCAO', version: 1, universalTitle: (candidate.fullName||candidate.name).slice(0,300), shortDescription: description.slice(0,1000), longDescription: description, category: candidate.category||'', bullets: supplier?.features??[], benefits: [], tags: [], spec, createdAt: at, updatedAt: at };
  return { ...state, products: [product, ...state.products], events: [{ id: `${id}:1`, productId: id, action: 'PRODUCAO_INICIADA', at, actor, version: 1 }, ...state.events],versions:[{productId:id,version:1,snapshot:product,at,actor},...(state.versions??[])] };
}
export function updateProduct(state: ProductFactoryState, id: string, input: Pick<MasterProduct, 'universalTitle'|'shortDescription'|'longDescription'|'category'|'bullets'|'benefits'|'tags'> & {spec?:UniversalProductSpec}, at: string, actor = 'Aprovador · controlado'): ProductFactoryState {
  const current = state.products.find(p => p.id === id);
  if (!current || current.status === 'PRONTO' || current.archivedAt) throw new Error('Este cadastro não está disponível para edição.');
  const clean = (values: string[]) => values.map(v => v.trim()).filter(Boolean);
  const version = current.version + 1;
  const next = { ...current, ...input, spec:input.spec??current.spec??emptyUniversalSpec, universalTitle: input.universalTitle.trim(), shortDescription: input.shortDescription.trim(), longDescription: input.longDescription.trim(), category: input.category.trim(), bullets: clean(input.bullets), benefits: clean(input.benefits), tags: clean(input.tags), version, updatedAt: at };
  return { ...state, products: state.products.map(p => p.id === id ? next : p), events: [{ id: `${id}:${version}`, productId: id, action: 'RASCUNHO_ATUALIZADO', at, actor, version }, ...state.events],versions:[{productId:id,version,snapshot:next,at,actor},...(state.versions??[])] };
}

// Re-read the persisted candidate after OCR. Fill missing fields only: human edits and
// completed products remain authoritative, and measurements never cross SKU boundaries.
export function refreshProductSupplier(state: ProductFactoryState, id: string, candidate: Candidate, at: string, actor: string): ProductFactoryState {
  const current = state.products.find(product => product.id === id);
  if (!current || current.candidateId !== candidate.id) throw new Error('Origem do cadastro não encontrada.');
  if (current.status === 'PRONTO' || current.archivedAt || !candidate.supplier) return state;
  const source = startProduct(emptyProductFactory, { ...candidate, status: 'APROVADO' }, id, at, actor).products[0].spec!;
  const spec = structuredClone(current.spec ?? emptyUniversalSpec);
  const technical = spec.technical ?? structuredClone(emptyTechnical);
  const incoming = source.technical!;
  const fillDimensions = (before: ProductTechnical['dimensions'], after: ProductTechnical['dimensions']) => ({
    lengthCm: before.lengthCm ?? after.lengthCm, widthCm: before.widthCm ?? after.widthCm, heightCm: before.heightCm ?? after.heightCm,
  });
  spec.technical = { ...technical, dimensions: fillDimensions(technical.dimensions, incoming.dimensions),
    weightGrams: technical.weightGrams ?? incoming.weightGrams,
    packageDimensions: fillDimensions(technical.packageDimensions, incoming.packageDimensions),
    packageWeightGrams: technical.packageWeightGrams ?? incoming.packageWeightGrams,
    specifications: { ...incoming.specifications, ...technical.specifications },
    features: technical.features.length ? technical.features : incoming.features };
  spec.materials = spec.materials.length ? spec.materials : source.materials;
  spec.sourceImages = [...new Set([...(spec.sourceImages ?? []), ...(source.sourceImages ?? [])])];
  spec.sourceUrl ||= source.sourceUrl;
  const bySku = new Map(source.variants.map(variant => [variant.sku, variant]));
  spec.variants = spec.variants.map(variant => {
    const incomingVariant = bySku.get(variant.sku);
    return incomingVariant ? { ...variant, dimensions: fillDimensions(variant.dimensions, incomingVariant.dimensions), weightGrams: variant.weightGrams ?? incomingVariant.weightGrams } : variant;
  });
  const existingSkus = new Set(spec.variants.map(variant => variant.sku));
  const existingIds = new Set(spec.variants.map(variant => variant.id));
  for (const variant of source.variants.filter(variant => !existingSkus.has(variant.sku))) {
    let variantId = variant.id;
    while (existingIds.has(variantId)) variantId += ':supplier';
    existingIds.add(variantId);
    spec.variants.push({ ...variant, id: variantId });
  }
  if (JSON.stringify(spec) === JSON.stringify(current.spec)) return state;
  return updateProduct(state, id, { universalTitle: current.universalTitle, shortDescription: current.shortDescription,
    longDescription: current.longDescription, category: current.category, bullets: current.bullets, benefits: current.benefits, tags: current.tags, spec }, at, actor);
}
export function markProductReady(state: ProductFactoryState, id: string, at: string, approvedMedia: number, actor = 'Aprovador · controlado'): ProductFactoryState {
  const current = state.products.find(p => p.id === id);
  if (!current || current.status !== 'EM_PRODUCAO' || current.archivedAt) throw new Error('Produto indisponível para conclusão.');
  const gaps = productGaps(current); if (gaps.length) throw new Error(`Complete antes de finalizar: ${gaps.join(', ')}.`);
  if (!Number.isFinite(approvedMedia)||approvedMedia<4) throw new Error('São necessárias no mínimo quatro mídias de estúdio aprovadas, fiéis e com ângulos distintos na Media Factory antes de finalizar.');
  const version = current.version + 1;
  const ready={...current,status:'PRONTO' as const,version,updatedAt:at};
  return { ...state, products: state.products.map(p => p.id === id ? ready : p), events: [{ id: `${id}:${version}`, productId: id, action: 'PRODUTO_PRONTO', at, actor, version }, ...state.events],versions:[{productId:id,version,snapshot:ready,at,actor},...(state.versions??[])] };
}
export function restoreProductVersion(state:ProductFactoryState,id:string,sourceVersion:number,at:string,actor='Aprovador · controlado'):ProductFactoryState{const current=state.products.find(product=>product.id===id);const source=(state.versions??[]).find(item=>item.productId===id&&item.version===sourceVersion);if(!current||!source||current.status==='PRONTO')throw new Error('Versão indisponível para restauração.');const version=current.version+1;const restored={...source.snapshot,status:'EM_PRODUCAO' as const,version,updatedAt:at};return{...state,products:state.products.map(product=>product.id===id?restored:product),events:[{id:`${id}:${version}`,productId:id,action:'VERSAO_RESTAURADA',at,actor,version},...state.events],versions:[{productId:id,version,snapshot:restored,at,actor},...(state.versions??[])]}}

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

// Fiscal data, variant logistics and availability change over the product's life (stock moves,
// the accountant fills NCM later), so unlike the commercial draft they stay editable after PRONTO.
// Each change is a new version with a snapshot, like every other product edit.
function versioned(state: ProductFactoryState, current: MasterProduct, next: MasterProduct, action: ProductEvent['action'], at: string, actor: string): ProductFactoryState {
  const version = current.version + 1;
  const saved = { ...next, version, updatedAt: at };
  return { ...state, products: state.products.map(p => p.id === current.id ? saved : p), events: [{ id: `${current.id}:${version}`, productId: current.id, action, at, actor, version }, ...state.events], versions: [{ productId: current.id, version, snapshot: saved, at, actor }, ...(state.versions ?? [])] };
}
export function updateProductFiscal(state: ProductFactoryState, id: string, input: { fiscal: Partial<ProductFiscal>; variants?: Partial<VariantLogistics>[] }, at: string, actor = 'Aprovador · controlado'): ProductFactoryState {
  const current = state.products.find(p => p.id === id);
  if (!current) throw new Error('Produto mestre não encontrado.');
  const fiscal = normalizeFiscal(input.fiscal);
  const spec = current.spec ?? emptyUniversalSpec;
  const patches = new Map((input.variants ?? []).map(item => { const clean = normalizeVariantLogistics(item); return [clean.id, clean]; }));
  for (const variantId of patches.keys()) if (!spec.variants.some(variant => variant.id === variantId)) throw new Error(`Variação ${variantId} não existe neste produto.`);
  const variants = spec.variants.map(variant => { const patch = patches.get(variant.id); return patch ? { ...variant, gtin: patch.gtin, weightGrams: patch.weightGrams, dimensions: patch.dimensions } : variant; });
  return versioned(state, current, { ...current, fiscal, spec: { ...spec, variants } }, 'DADOS_FISCAIS_ATUALIZADOS', at, actor);
}
export function setProductAvailability(state: ProductFactoryState, id: string, availability: Availability, at: string, actor = 'Aprovador · controlado'): ProductFactoryState {
  const current = state.products.find(p => p.id === id);
  if (!current) throw new Error('Produto mestre não encontrado.');
  if (availability !== 'PRONTA_ENTREGA' && availability !== 'SOB_ENCOMENDA') throw new Error('Disponibilidade inválida.');
  if (current.availability === availability) return state;
  return versioned(state, current, { ...current, availability }, 'DISPONIBILIDADE_ALTERADA', at, actor);
}

export function archiveProducts(state: ProductFactoryState, productIds: string[], reason: string, at: string, actor: string): ProductFactoryState {
  if (!reason.trim()) throw new Error('Informe o motivo do arquivamento.');
  const selected = new Set(productIds);
  const products = state.products.filter(product => selected.has(product.id) && product.status === 'EM_PRODUCAO' && !product.archivedAt);
  if (!products.length) throw new Error('Nenhum cadastro em produção disponível para arquivar.');
  const updates = new Map(products.map(product => [product.id, { ...product, archivedAt: at, archivedReason: reason.trim(), updatedAt: at, version: product.version + 1 }]));
  return { ...state, products: state.products.map(product => updates.get(product.id) ?? product),
    events: [...products.map(product => ({ id: `${product.id}:${product.version + 1}`, productId: product.id, action: 'PRODUTO_ARQUIVADO' as const, at, actor, reason: reason.trim(), version: product.version + 1 })), ...state.events],
    versions: [...[...updates.values()].map(snapshot => ({ productId: snapshot.id, version: snapshot.version, snapshot, at, actor })), ...(state.versions ?? [])],
    completionRequests: (state.completionRequests ?? []).map(request => updates.has(request.productId) ? { ...request, status: 'BLOCKED' as const, code: 'product_archived', reason: `Cadastro arquivado: ${reason}`, updatedAt: at } : request) };
}
