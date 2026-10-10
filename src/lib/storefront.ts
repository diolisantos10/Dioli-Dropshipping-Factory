// Storefront view model shared by Prateleira Bruta, Triagem and Disponíveis: every item becomes a
// product card (photo, name, cost, suggested price, stock, supplier) with the same filters.
import type { CatalogRecord, CurationStatus } from './catalog.ts';
import type { Candidate, CandidateStatus, CandidateSupplier } from './intake.ts';
import { approvedStudioMedia } from './media-factory.ts';
import type { PriceCalculation } from './pricing.ts';
import { fiscalCompletion, type Availability } from './product-fiscal.ts';
import { isEyewearProduct, normalizeProductText, productMissingTechnical } from './product-filters.ts';

export type CardVariant = { id: string; label: string; detail: string; price: number | null; stock: number | null; imageUrl: string };
export type StoreCard = {
  id: string; title: string; fullTitle: string; imageUrl: string; images: string[];
  cost: number | null; currency: string; suggestedPrice: number | null; priceCurrency: string;
  stock: number | null; supplier: string; supplierRef: string; state: string; stateLabel: string;
  category: string; url: string; description: string; variants: CardVariant[]; searchText: string;
  // Stock model badge; only master products carry it (candidates have no stock model yet).
  availability?: Availability; fiscalCompletion?: number; sourceDetails?: CandidateSupplier;
  technicalGaps?: { dimensions: boolean; weight: boolean; material: boolean };
};
export type StoreFilters = { query?: string; minCost?: string; maxCost?: string; supplier?: string; state?: string; availability?: string; category?: string; eyewearOnly?: boolean; missing?: '' | 'dimensions' | 'weight' | 'material' | 'any' };
export const NO_AVAILABILITY = 'SEM_DEFINICAO';
export const NO_CATEGORY = 'SEM_CATEGORIA';
const measured = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const dimensionsComplete = (value?: CandidateSupplier['dimensions']) => !!value && measured(value.lengthCm) && measured(value.widthCm) && measured(value.heightCm);
export function supplierTechnicalGaps(supplier?: CandidateSupplier) {
  const variants = supplier?.variants ?? [];
  const single = variants.length <= 1;
  return {
    dimensions: !(variants.length ? variants.every(variant => dimensionsComplete({ lengthCm: variant.dimensions?.lengthCm ?? (single ? supplier?.dimensions?.lengthCm : undefined), widthCm: variant.dimensions?.widthCm ?? (single ? supplier?.dimensions?.widthCm : undefined), heightCm: variant.dimensions?.heightCm ?? (single ? supplier?.dimensions?.heightCm : undefined) })) : dimensionsComplete(supplier?.dimensions)),
    weight: !(variants.length ? variants.every(variant => measured(variant.weightGrams ?? (single ? supplier?.weightGrams : undefined))) : measured(supplier?.weightGrams)),
    material: !supplier?.materials?.some(value => value.trim()),
  };
}

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
  CANDIDATO: 'Na prateleira', TRIADO: 'Reservado na triagem', INFORMACAO_SOLICITADA: 'Informação solicitada', APROVADO: 'Produção autorizada', REJEITADO: 'Rejeitado', ARQUIVADO: 'Arquivado',
};

export function candidateCard(candidate: Candidate): StoreCard {
  const legacy = parseLegacyNotes(candidate.notes);
  const supplier = candidate.supplier;
  const images = [...new Set([supplier?.imageUrl, ...(supplier?.images ?? []), legacy.imageUrl].filter((item): item is string => !!item))];
  const variants = (supplier?.variants ?? []).map((item, index) => ({ id: item.sku || String(index), label: item.label, detail: [`SKU ${item.sku}`, ...Object.entries(item.attributes ?? {}).map(([key, value]) => `${key}: ${value}`)].join(' · '), price: item.price, stock: item.stock, imageUrl: item.imageUrl ?? '' }));
  const fullTitle = candidate.fullName || candidate.name;
  const card: Omit<StoreCard, 'searchText'> = {
    id: candidate.id, title: candidate.name, fullTitle, imageUrl: images[0] ?? '', images,
    cost: supplier?.cost ?? legacy.cost, currency: supplier?.currency || legacy.currency || 'BRL',
    suggestedPrice: null, priceCurrency: supplier?.currency || legacy.currency || 'BRL',
    stock: supplier?.stock ?? legacy.stock, supplier: supplier?.name || legacy.supplier || (candidate.source === 'TREND' ? 'Trend' : 'Manual'),
    supplierRef: supplier?.ref || legacy.ref, state: candidate.status, stateLabel: candidateStateLabels[candidate.status],
    category: candidate.category ?? '', url: candidate.url, description: supplier?.description || '', variants, technicalGaps: supplierTechnicalGaps(supplier), sourceDetails: supplier ?? { name: legacy.supplier || 'Manual', ref: legacy.ref, cost: legacy.cost, currency: legacy.currency || 'BRL', stock: legacy.stock, imageUrl: legacy.imageUrl, images, variants: [] },
  };
  return { ...card, searchText: [fullTitle, candidate.url, candidate.notes, card.supplier, card.supplierRef, card.category, ...variants.map(variant => `${variant.id} ${variant.label} ${variant.detail}`)].join(' ').toLocaleLowerCase('pt-BR') };
}

export const curationLabels: Record<CurationStatus | 'PRONTO', string> = { PRONTO: 'Pronto', APROVADO: 'Aprovado', REJEITADO: 'Rejeitado', ARQUIVADO: 'Arquivado' };

// Newest calculation first; an approved price wins over a pending one, a blocked one never shows.
export function suggestedPriceOf(prices: PriceCalculation[]) {
  const usable = prices.filter(item => item.suggestedPrice !== null && item.status !== 'BLOQUEADO').sort((a, b) => b.at.localeCompare(a.at));
  const best = usable.find(item => item.approval === 'APROVADO') ?? usable[0];
  return best ? { price: best.suggestedPrice, currency: best.currency } : null;
}

export function productCard(record: CatalogRecord, candidate?: Candidate, curation?: CurationStatus): StoreCard {
  const product = record.product;
  const origin = candidate ? candidateCard(candidate) : null;
  const approved = approvedStudioMedia(record.media, product.id).map(item => item.url);
  const images = [...new Set(approved)];
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
    state, stateLabel: curationLabels[state], category: product.category, url: origin?.url || product.spec?.sourceUrl || '',
    description: product.shortDescription || product.longDescription, variants: variants.length ? variants : origin?.variants ?? [],
    availability: product.availability, fiscalCompletion: fiscalCompletion(product), technicalGaps: productMissingTechnical(product),
  };
  const skus = (product.spec?.variants ?? []).map(item => `${item.sku} ${item.title}`);
  return { ...card, searchText: [card.title, card.category, card.supplier, card.supplierRef, ...product.tags, ...skus].join(' ').toLocaleLowerCase('pt-BR') };
}

// Pseudo-state for the default view: everything except archived items.
export const ACTIVE_STATES = 'ATIVOS';
const amount = (value?: string) => { const parsed = value?.trim() ? Number(value.replace(',', '.')) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };
export function filterCards(cards: StoreCard[], filters: StoreFilters) {
  const query = normalizeProductText(filters.query ?? '');
  const min = amount(filters.minCost); const max = amount(filters.maxCost);
  return cards.filter(card => (!query || normalizeProductText(card.searchText).includes(query))
    && (min === null || (card.cost !== null && card.cost >= min))
    && (max === null || (card.cost !== null && card.cost <= max))
    && (!filters.supplier || card.supplier === filters.supplier)
    && (!filters.category || (filters.category === NO_CATEGORY ? !card.category.trim() : normalizeProductText(card.category) === normalizeProductText(filters.category)))
    && (!filters.eyewearOnly || isEyewearProduct(card.category, card.fullTitle || card.title))
    && (!filters.missing || (filters.missing === 'any' ? Object.values(card.technicalGaps ?? supplierTechnicalGaps(card.sourceDetails)).some(Boolean) : (card.technicalGaps ?? supplierTechnicalGaps(card.sourceDetails))[filters.missing]))
    && (!filters.state || (filters.state === ACTIVE_STATES ? card.state !== 'ARQUIVADO' : card.state === filters.state))
    && (!filters.availability || (filters.availability === NO_AVAILABILITY ? !card.availability : card.availability === filters.availability)));
}
export const suppliersOf = (cards: StoreCard[]) => [...new Set(cards.map(card => card.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
export const categoriesOf = (cards: StoreCard[]) => [...new Set(cards.map(card => card.category).filter(value => value.trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/** Every filtered result participates; command size stays bounded regardless of pagination. */
export async function runCardBulk(ids: string[], status: string, reason: string, apply: (ids: string[], status: string, reason: string) => Promise<string>, onProgress?: (completed: string[]) => void) {
  const unique = [...new Set(ids)];
  const messages: string[] = []; const completed: string[] = [];
  for (let offset = 0; offset < unique.length; offset += 200) {
    const batch = unique.slice(offset, offset + 200);
    messages.push(await apply(batch, status, reason)); completed.push(...batch); onProgress?.([...completed]);
  }
  return messages.join(' ');
}
