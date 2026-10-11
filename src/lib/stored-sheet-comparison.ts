import type { IntakeState } from './intake.ts';
import type { ProductFactoryState, MasterProduct } from './product-factory.ts';
import { isEyewearProduct } from './product-filters.ts';
import { candidateCard, masterVariantCards } from './storefront.ts';

/** Read-only counts for one pilot and one older eyewear sheet. No payload, URL, SKU or identifier disclosure. */
export function storedSheetComparison(intake: IntakeState, products: ProductFactoryState, itemId: string) {
  const candidates = new Map(intake.candidates.map(candidate => [candidate.id, candidate]));
  const source = intake.candidates.find(candidate => candidate.supplier?.ref === itemId || (() => {
    try { return new URL(candidate.url).pathname === `/item/${itemId}.html`; } catch { return false; }
  })());
  const pilot = products.products.find(product => product.candidateId === source?.id);
  const legacy = products.products.find(product => product !== pilot && product.status === 'PRONTO' && !product.archivedAt
    && candidates.has(product.candidateId) && isEyewearProduct(product.category, `${product.universalTitle} ${candidates.get(product.candidateId)?.name ?? ''}`));
  const summarize = (product?: MasterProduct) => {
    if (!product) return { found: false };
    const candidate = candidates.get(product.candidateId);
    const origin = candidate ? candidateCard(candidate) : undefined;
    const saved = masterVariantCards(product, origin?.variants);
    const displayed = saved.length ? saved : origin?.variants ?? [];
    const references = new Set([...(product.spec?.sourceImages ?? []), ...(origin?.images ?? [])]);
    return { found: true, savedVariantCount: saved.length, sourceVariantCount: origin?.variants.length ?? 0,
      sourceVariantImages: origin?.variants.filter(variant => variant.imageUrl).length ?? 0,
      displayedVariantImages: displayed.filter(variant => variant.imageUrl).length,
      savedReferenceCount: product.spec?.sourceImages?.length ?? 0, displayedReferenceCount: references.size,
      savedAttributeCount: saved.reduce((count, variant) => count + Object.keys(variant.attributes ?? {}).length, 0),
      sourceAttributeCount: origin?.variants.reduce((count, variant) => count + Object.keys(variant.attributes ?? {}).length, 0) ?? 0,
      savedSpecificationCount: Object.keys(product.spec?.technical?.specifications ?? {}).length,
      sourceSpecificationCount: Object.keys(candidate?.supplier?.specifications ?? {}).length,
      sourceEvidenceCount: candidate?.supplier?.visualAttributes?.length ?? 0,
      originalLinkPresent: !!(origin?.url || product.spec?.sourceUrl) };
  };
  return { pilot: summarize(pilot), legacy: summarize(legacy) };
}
