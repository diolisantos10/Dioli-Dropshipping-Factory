import type { MediaAsset } from './media-factory';
import type { MasterProduct, ProductEvent } from './product-factory';
import type { PriceCalculation } from './pricing';

export type CatalogParty = { id: string; name: string; active: boolean };
export type SupplierOffer = {
  id: string; productId: string; supplierRef: string; supplierName: string;
  cost: number; currency: string; stock: number | null; leadTimeDays: number | null; updatedAt: string;
};
export type ProductAssignment = { productId: string; brandIds: string[]; storeIds: string[]; destinations: string[]; updatedAt: string };
export type CurationStatus = 'APROVADO' | 'REJEITADO' | 'ARQUIVADO';
// Latest storefront decision per product; the full before/after trail lives in audit_events.
export type CatalogCuration = { productId: string; status: CurationStatus; reason: string; actor: string; at: string };
export type CatalogState = { version: 1; brands: CatalogParty[]; stores: CatalogParty[]; offers: SupplierOffer[]; assignments: ProductAssignment[]; curation?: CatalogCuration[] };
export type CatalogFilters = { query?: string; category?: string; brandId?: string; storeId?: string; destination?: string; gapsOnly?: boolean };
export type CatalogRecord = {
  product: MasterProduct; assignment: ProductAssignment; brands: CatalogParty[]; stores: CatalogParty[];
  offers: SupplierOffer[]; media: MediaAsset[]; prices: PriceCalculation[]; history: ProductEvent[];
  destinationGaps: Record<string, string[]>;
};

export const CATALOG_STORAGE_KEY = 'ddf.catalog.demo.v1';
export const emptyCatalog: CatalogState = {
  version: 1,
  brands: ['Santioh', 'Dilee', 'Dilix', 'Queise'].map(name => ({ id: name.toLocaleLowerCase(), name, active: true })),
  stores: [], offers: [], assignments: [],
};

const unique = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))];
export function upsertParty(state: CatalogState, kind: 'brand'|'store', party: CatalogParty): CatalogState {
  if (!party.id.trim() || !party.name.trim()) throw new Error('Identificador e nome são obrigatórios.');
  const key = kind === 'brand' ? 'brands' : 'stores';
  const list = state[key];
  const next = { ...party, id: party.id.trim(), name: party.name.trim() };
  return { ...state, [key]: list.some(item => item.id === next.id) ? list.map(item => item.id === next.id ? next : item) : [...list, next] };
}
export function assignProduct(state: CatalogState, productId: string, input: Omit<ProductAssignment, 'productId'|'updatedAt'>, at: string): CatalogState {
  if (!productId.trim()) throw new Error('Produto obrigatório.');
  const assignment: ProductAssignment = { productId, brandIds: unique(input.brandIds), storeIds: unique(input.storeIds), destinations: unique(input.destinations), updatedAt: at };
  return { ...state, assignments: [assignment, ...state.assignments.filter(item => item.productId !== productId)] };
}
export function addSupplierOffer(state: CatalogState, input: Omit<SupplierOffer, 'id'|'updatedAt'>, id: string, at: string): CatalogState {
  if (!input.productId.trim() || !input.supplierName.trim() || !input.supplierRef.trim() || !input.currency.trim()) throw new Error('Produto, fornecedor, referência e moeda são obrigatórios.');
  if (!Number.isFinite(input.cost) || input.cost < 0 || (input.stock !== null && (!Number.isInteger(input.stock) || input.stock < 0)) || (input.leadTimeDays !== null && (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0))) throw new Error('Custo, estoque e prazo devem ser valores válidos.');
  if (state.offers.some(offer => offer.productId === input.productId && offer.supplierName.toLocaleLowerCase() === input.supplierName.toLocaleLowerCase() && offer.supplierRef === input.supplierRef)) throw new Error('Esta oferta de fornecedor já existe.');
  return { ...state, offers: [{ ...input, id, supplierName: input.supplierName.trim(), supplierRef: input.supplierRef.trim(), currency: input.currency.trim().toUpperCase(), updatedAt: at }, ...state.offers] };
}
export function catalogRecords(state: CatalogState, products: MasterProduct[], media: MediaAsset[], prices: PriceCalculation[], events: ProductEvent[]): CatalogRecord[] {
  return products.filter(product => product.status === 'PRONTO').map(product => {
    const assignment = state.assignments.find(item => item.productId === product.id) ?? { productId: product.id, brandIds: [], storeIds: [], destinations: [], updatedAt: product.updatedAt };
    return { product, assignment, brands: state.brands.filter(item => assignment.brandIds.includes(item.id)), stores: state.stores.filter(item => assignment.storeIds.includes(item.id)), offers: state.offers.filter(item => item.productId === product.id), media: media.filter(item => item.productId === product.id), prices: prices.filter(item => item.productId === product.id), history: events.filter(item => item.productId === product.id), destinationGaps: product.spec?.destinationGaps ?? {} };
  });
}
export function filterCatalog(records: CatalogRecord[], filters: CatalogFilters): CatalogRecord[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  return records.filter(record => {
    const searchable = [record.product.universalTitle, record.product.category, ...record.product.tags, ...record.product.spec?.variants.map(item => `${item.sku} ${item.title}`) ?? []].join(' ').toLocaleLowerCase();
    const hasGaps = Object.values(record.destinationGaps).some(gaps => gaps.length > 0);
    return (!query || searchable.includes(query)) && (!filters.category || record.product.category === filters.category) && (!filters.brandId || record.assignment.brandIds.includes(filters.brandId)) && (!filters.storeId || record.assignment.storeIds.includes(filters.storeId)) && (!filters.destination || record.assignment.destinations.includes(filters.destination)) && (!filters.gapsOnly || hasGaps);
  });
}
export function curateProducts(state: CatalogState, productIds: string[], status: CurationStatus, reason: string, actor: string, at: string): CatalogState {
  const unique = [...new Set(productIds.map(id => id.trim()).filter(Boolean))];
  if (!unique.length) throw new Error('Selecione ao menos um produto.');
  if (!reason.trim() || reason.length > 2000) throw new Error('Registre uma justificativa de até 2.000 caracteres.');
  const decisions = unique.map(productId => ({ productId, status, reason: reason.trim(), actor, at }));
  return { ...state, curation: [...decisions, ...(state.curation ?? []).filter(item => !unique.includes(item.productId))] };
}
export function refreshSupplierOffer(state: CatalogState, offerId: string, input: { cost: number; currency: string; stock: number | null; leadTimeDays: number | null }, at: string): CatalogState {
  const offer = state.offers.find(item => item.id === offerId);
  if (!offer) throw new Error('Oferta de fornecedor não encontrada.');
  if (!Number.isFinite(input.cost) || input.cost < 0 || !input.currency.trim() || (input.stock !== null && (!Number.isInteger(input.stock) || input.stock < 0)) || (input.leadTimeDays !== null && (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0))) throw new Error('Snapshot de fornecedor inválido.');
  return { ...state, offers: state.offers.map(item => item.id === offerId ? { ...item, cost: input.cost, currency: input.currency.trim().toUpperCase(), stock: input.stock, leadTimeDays: input.leadTimeDays, updatedAt: at } : item) };
}
