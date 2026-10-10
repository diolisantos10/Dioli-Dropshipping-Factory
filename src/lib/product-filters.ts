import type { Candidate } from './intake';
import type { MasterProduct } from './product-factory';

export const normalizeProductText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();

/** Category and title evidence only: supplier names/notes cannot classify unrelated products. */
export function isEyewearProduct(category: string, title: string) {
  const text = normalizeProductText(`${category} ${title}`);
  const eyewear = /\b(oculos|sunglasses|eyeglasses|eyewear|spectacles)\b|\b(glasses|optical) frames?\b|\barmacao\b.*\b(oculos|grau)\b/.test(text);
  const accessory = /\b(case|cases|pouch|holder|stand|cleaner|cleaning|cloth|cord|strap|estojo|estojos|capa|capas|cordao|limpeza|limpador|suporte)\b/.test(normalizeProductText(title));
  return eyewear && !accessory;
}

export type ProductFilters = {
  query: string; eyewearOnly: boolean; category: string; supplier: string; brand: string;
  status: '' | 'EM_PRODUCAO' | 'PRONTO';
  missing: '' | 'dimensions' | 'weight' | 'material' | 'any';
  media: '' | 'pending' | 'complete';
  archived?: 'active' | 'only' | 'all';
};
export const emptyProductFilters: ProductFilters = { query: '', eyewearOnly: false, category: '', supplier: '', brand: '', status: '', missing: '', media: '', archived: 'active' };
const measured = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const dimensionsComplete = (value?: { lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null }) => !!value && measured(value.lengthCm) && measured(value.widthCm) && measured(value.heightCm);
export function productMissingTechnical(product: MasterProduct) {
  const variants = product.spec?.variants ?? [];
  return {
    dimensions: !(variants.length ? variants.every(variant => dimensionsComplete(variant.dimensions)) : dimensionsComplete(product.spec?.technical?.dimensions)),
    weight: !(variants.length ? variants.every(variant => measured(variant.weightGrams)) : measured(product.spec?.technical?.weightGrams)),
    material: !product.spec?.materials?.some(material => material.trim()),
  };
}
export function matchesProductFilters(product: MasterProduct, candidate: Candidate | undefined, filters: ProductFilters, studioCount = 0) {
  const sourceName = candidate?.supplier?.name ?? '';
  const query = normalizeProductText(filters.query);
  const search = [product.universalTitle, product.category, product.id, product.spec?.technical?.brand ?? '', sourceName, candidate?.fullName ?? '', candidate?.name ?? '', candidate?.supplier?.ref ?? '', ...product.tags, ...(product.spec?.variants ?? []).map(variant => `${variant.sku} ${variant.title}`)].join(' ');
  const gaps = productMissingTechnical(product);
  return (!query || normalizeProductText(search).includes(query))
    && (filters.archived === 'all' || (filters.archived === 'only' ? !!product.archivedAt : !product.archivedAt))
    && (!filters.eyewearOnly || isEyewearProduct(`${product.category} ${candidate?.category ?? ''}`, `${product.universalTitle} ${candidate?.fullName ?? candidate?.name ?? ''}`))
    && (!filters.category || normalizeProductText(product.category) === normalizeProductText(filters.category))
    && (!filters.supplier || sourceName === filters.supplier)
    && (!filters.brand || product.spec?.technical?.brand === filters.brand)
    && (!filters.status || product.status === filters.status)
    && (!filters.missing || (filters.missing === 'any' ? Object.values(gaps).some(Boolean) : gaps[filters.missing]))
    && (!filters.media || (filters.media === 'complete' ? studioCount >= 4 : studioCount < 4));
}

/** Approved candidates share the same filters without creating or saving a master product. */
export function matchesApprovedCandidateFilters(candidate: Candidate, filters: ProductFilters) {
  const supplier = candidate.supplier;
  const specifications = supplier?.specifications ?? {};
  const brand = Object.entries(specifications).find(([key]) => ['brand', 'brand name', 'marca'].includes(normalizeProductText(key)))?.[1] ?? '';
  const placeholder: MasterProduct = { id: candidate.id, candidateId: candidate.id, status: 'EM_PRODUCAO', version: 1, universalTitle: candidate.fullName || candidate.name, shortDescription: '', longDescription: '', category: candidate.category ?? '', bullets: [], benefits: [], tags: [], createdAt: candidate.createdAt, updatedAt: candidate.createdAt, spec: { materials: supplier?.materials ?? [], colors: [], sizes: [], seo: { title: '', description: '' }, compliance: { notes: '', certifications: [] }, localizations: {}, destinationGaps: {}, variants: (supplier?.variants ?? []).map((variant, index) => ({ id: String(index), sku: variant.sku, title: variant.label, gtin: '', attributes: variant.attributes ?? {}, weightGrams: variant.weightGrams ?? ((supplier?.variants.length ?? 0) <= 1 ? supplier?.weightGrams ?? null : null), dimensions: { lengthCm: variant.dimensions?.lengthCm ?? ((supplier?.variants.length ?? 0) <= 1 ? supplier?.dimensions?.lengthCm ?? null : null), widthCm: variant.dimensions?.widthCm ?? ((supplier?.variants.length ?? 0) <= 1 ? supplier?.dimensions?.widthCm ?? null : null), heightCm: variant.dimensions?.heightCm ?? ((supplier?.variants.length ?? 0) <= 1 ? supplier?.dimensions?.heightCm ?? null : null) } })) } };
  // A candidate with no SKU still exposes its supplied measurements for filtering.
  if (!placeholder.spec!.variants.length) placeholder.spec!.variants.push({ id: 'source', sku: '', title: '', gtin: '', attributes: {}, dimensions: { lengthCm: supplier?.dimensions?.lengthCm ?? null, widthCm: supplier?.dimensions?.widthCm ?? null, heightCm: supplier?.dimensions?.heightCm ?? null }, weightGrams: supplier?.weightGrams ?? null });
  return matchesProductFilters(placeholder, candidate, { ...filters, brand: '' }) && (!filters.brand || brand === filters.brand);
}
