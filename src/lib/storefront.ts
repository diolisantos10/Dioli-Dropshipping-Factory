// Storefront view model shared by Prateleira Bruta, Triagem and Disponíveis: every item becomes a
// product card (photo, name, cost, suggested price, stock, supplier) with the same filters.
import type { CatalogRecord, CurationStatus } from './catalog.ts';
import type { Candidate, CandidateStatus } from './intake.ts';
import type { MediaAsset } from './media-factory.ts';
import type { PriceCalculation } from './pricing.ts';

export type CardVariant = { id: string; label: string; detail: string; price: number | null; stock: number | null; imageUrl: string };
export type StoreCard = {
  id: string; title: string; fullTitle: string; imageUrl: string; images: string[];
  cost: number | null; currency: string; suggestedPrice: number | null; priceCurrency: string;
  stock: number | null; supplier: string; supplierRef: string; state: string; stateLabel: string;
  category: string; url: string; description: string; variants: CardVariant[]; searchText: string;
};
export type StoreFilters = { query?: string; minCost?: string; maxCost?: string; supplier?: string; state?: string };

const IMAGE_URL = /\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i;
const line = (notes: string, label: string) => notes.split('\n').find(item => item.toLocaleLowerCase('pt-BR').startsWith(`${label}:`))?.slice(label.length + 1).trim() ?? '';

// Candidates imported before structured supplier data existed keep it in the notes text.
export function parseLegacyNotes(notes: string) {
  const costText = line(notes, 'custo informado');
  const costMatch = costText.match(/^([A-Za-z]{3})\s+([\d.,]+)$/);
  const stockText = line(notes, 'estoque');
  const stock = /^\d+$/.test(stockText) ? Number(stockText) : null;
  const image = line(notes, 'imagem');
  return {
    supplier: line(notes, 'fornecedor'), ref: line(notes, 'referência'),
    cost: costMatch ? Number(costMatch[2].replace(',', '.')) : null, currency: costMatch ? costMatch[1].toUpperCase() : '',
    stock, imageUrl: /^https:\/\//.test(image) ? image : '',
  };
}

export const candidateStateLabels: Record<CandidateStatus, string> = {
  CANDIDATO: 'Na prateleira', TRIADO: 'Aguardando decisão', INFORMACAO_SOLICITADA: 'Informação solicitada', APROVADO: 'Aprovado', REJEITADO: 'Rejeitado', ARQUIVADO: 'Arquivado',
};

export function candidateCard(candidate: Candidate): StoreCard {
  const legacy = parseLegacyNotes(candidate.notes);
  const supplier = candidate.supplier;
  const images = [...new Set([supplier?.imageUrl, ...(supplier?.images ?? []), legacy.imageUrl].filter((item): item is string => !!item))];
  const variants = (supplier?.variants ?? []).map((item, index) => ({ id: item.sku || String(index), label: item.label, detail: `SKU ${item.sku}`, price: item.price, stock: item.stock, imageUrl: item.imageUrl ?? '' }));
  const fullTitle = candidate.fullName || candidate.name;
  const card: Omit<StoreCard, 'searchText'> = {
    id: candidate.id, title: candidate.name, fullTitle, imageUrl: images[0] ?? '', images,
    cost: supplier?.cost ?? legacy.cost, currency: supplier?.currency || legacy.currency || 'BRL',
    suggestedPrice: null, priceCurrency: supplier?.currency || legacy.currency || 'BRL',
    stock: supplier?.stock ?? legacy.stock, supplier: supplier?.name || legacy.supplier || (candidate.source === 'TREND' ? 'Trend' : 'Manual'),
    supplierRef: supplier?.ref || legacy.ref, state: candidate.status, stateLabel: candidateStateLabels[candidate.status],
    category: candidate.category ?? '', url: candidate.url, description: candidate.notes, variants,
  };
  return { ...card, searchText: [fullTitle, candidate.url, candidate.notes, card.supplier, card.supplierRef, card.category].join(' ').toLocaleLowerCase('pt-BR') };
}

export const curationLabels: Record<CurationStatus | 'PRONTO', string> = { PRONTO: 'Pronto', APROVADO: 'Aprovado', REJEITADO: 'Rejeitado', ARQUIVADO: 'Arquivado' };

const isImage = (asset: MediaAsset) => asset.mimeType ? asset.mimeType.startsWith('image/') : IMAGE_URL.test(asset.url) || asset.url.startsWith('/api/media');
// Newest calculation first; an approved price wins over a pending one, a blocked one never shows.
export function suggestedPriceOf(prices: PriceCalculation[]) {
  const usable = prices.filter(item => item.suggestedPrice !== null && item.status !== 'BLOQUEADO').sort((a, b) => b.at.localeCompare(a.at));
  const best = usable.find(item => item.approval === 'APROVADO') ?? usable[0];
  return best ? { price: best.suggestedPrice, currency: best.currency } : null;
}

export function productCard(record: CatalogRecord, candidate?: Candidate, curation?: CurationStatus): StoreCard {
  const product = record.product;
  const origin = candidate ? candidateCard(candidate) : null;
  const approved = record.media.filter(item => item.status === 'APROVADA' && isImage(item)).map(item => item.url);
  const images = [...new Set([...approved, ...(origin?.images ?? [])])];
  const offers = [...record.offers].sort((a, b) => a.cost - b.cost);
  const cheapest = offers[0];
  const knownStock = offers.filter(item => item.stock !== null);
  const price = suggestedPriceOf(record.prices);
  const variants = (product.spec?.variants ?? []).map(item => ({
    id: item.id, label: item.title || item.sku,
    detail: [`SKU ${item.sku}`, item.gtin && `GTIN ${item.gtin}`, ...Object.entries(item.attributes).map(([key, value]) => `${key}: ${value}`)].filter(Boolean).join(' · '),
    price: null, stock: null, imageUrl: '',
  }));
  const state = curation ?? 'PRONTO';
  const card: Omit<StoreCard, 'searchText'> = {
    id: product.id, title: product.universalTitle, fullTitle: product.universalTitle, imageUrl: images[0] ?? '', images,
    cost: cheapest?.cost ?? origin?.cost ?? null, currency: cheapest?.currency ?? origin?.currency ?? 'BRL',
    suggestedPrice: price?.price ?? null, priceCurrency: price?.currency ?? cheapest?.currency ?? 'BRL',
    stock: knownStock.length ? knownStock.reduce((sum, item) => sum + (item.stock ?? 0), 0) : origin?.stock ?? null,
    supplier: cheapest?.supplierName ?? origin?.supplier ?? 'Sem fornecedor', supplierRef: cheapest?.supplierRef ?? origin?.supplierRef ?? '',
    state, stateLabel: curationLabels[state], category: product.category, url: origin?.url ?? '',
    description: product.shortDescription || product.longDescription, variants: variants.length ? variants : origin?.variants ?? [],
  };
  const skus = (product.spec?.variants ?? []).map(item => `${item.sku} ${item.title}`);
  return { ...card, searchText: [card.title, card.category, card.supplier, card.supplierRef, ...product.tags, ...skus].join(' ').toLocaleLowerCase('pt-BR') };
}

// Pseudo-state for the default view: everything except archived items.
export const ACTIVE_STATES = 'ATIVOS';
const amount = (value?: string) => { const parsed = value?.trim() ? Number(value.replace(',', '.')) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };
export function filterCards(cards: StoreCard[], filters: StoreFilters) {
  const query = filters.query?.trim().toLocaleLowerCase('pt-BR') ?? '';
  const min = amount(filters.minCost); const max = amount(filters.maxCost);
  return cards.filter(card => (!query || card.searchText.includes(query))
    && (min === null || (card.cost !== null && card.cost >= min))
    && (max === null || (card.cost !== null && card.cost <= max))
    && (!filters.supplier || card.supplier === filters.supplier)
    && (!filters.state || (filters.state === ACTIVE_STATES ? card.state !== 'ARQUIVADO' : card.state === filters.state)));
}
export const suppliersOf = (cards: StoreCard[]) => [...new Set(cards.map(card => card.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
