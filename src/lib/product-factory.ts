import type { Candidate } from './intake';

export type MasterProductStatus = 'EM_PRODUCAO' | 'PRONTO';
export type MasterProduct = {
  id: string; candidateId: string; status: MasterProductStatus; version: number;
  universalTitle: string; shortDescription: string; longDescription: string;
  category: string; bullets: string[]; benefits: string[]; tags: string[];
  createdAt: string; updatedAt: string;
};
export type ProductEvent = { id: string; productId: string; action: 'PRODUCAO_INICIADA' | 'RASCUNHO_ATUALIZADO' | 'PRODUTO_PRONTO'; at: string; actor: string; version: number };
export type ProductFactoryState = { version: 1; products: MasterProduct[]; events: ProductEvent[] };
export const PRODUCT_STORAGE_KEY = 'ddf.products.demo.v1';
export const emptyProductFactory: ProductFactoryState = { version: 1, products: [], events: [] };

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
  const product: MasterProduct = { id, candidateId: candidate.id, status: 'EM_PRODUCAO', version: 1, universalTitle: candidate.name, shortDescription: '', longDescription: candidate.notes, category: '', bullets: [], benefits: [], tags: [], createdAt: at, updatedAt: at };
  return { ...state, products: [product, ...state.products], events: [{ id: `${id}:1`, productId: id, action: 'PRODUCAO_INICIADA', at, actor: 'Aprovador · demonstração', version: 1 }, ...state.events] };
}
export function updateProduct(state: ProductFactoryState, id: string, input: Pick<MasterProduct, 'universalTitle'|'shortDescription'|'longDescription'|'category'|'bullets'|'benefits'|'tags'>, at: string): ProductFactoryState {
  const current = state.products.find(p => p.id === id);
  if (!current || current.status === 'PRONTO') throw new Error('Este cadastro não está disponível para edição.');
  const clean = (values: string[]) => values.map(v => v.trim()).filter(Boolean);
  const version = current.version + 1;
  const next = { ...current, ...input, universalTitle: input.universalTitle.trim(), shortDescription: input.shortDescription.trim(), longDescription: input.longDescription.trim(), category: input.category.trim(), bullets: clean(input.bullets), benefits: clean(input.benefits), tags: clean(input.tags), version, updatedAt: at };
  return { ...state, products: state.products.map(p => p.id === id ? next : p), events: [{ id: `${id}:${version}`, productId: id, action: 'RASCUNHO_ATUALIZADO', at, actor: 'Aprovador · demonstração', version }, ...state.events] };
}
export function markProductReady(state: ProductFactoryState, id: string, at: string): ProductFactoryState {
  const current = state.products.find(p => p.id === id);
  if (!current || current.status !== 'EM_PRODUCAO') throw new Error('Produto indisponível para conclusão.');
  const gaps = productGaps(current); if (gaps.length) throw new Error(`Complete antes de finalizar: ${gaps.join(', ')}.`);
  const version = current.version + 1;
  return { ...state, products: state.products.map(p => p.id === id ? { ...p, status: 'PRONTO', version, updatedAt: at } : p), events: [{ id: `${id}:${version}`, productId: id, action: 'PRODUTO_PRONTO', at, actor: 'Aprovador · demonstração', version }, ...state.events] };
}
