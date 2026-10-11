import type { IntakeState } from './intake.ts';
import { refreshProductSupplier, type ProductFactoryState } from './product-factory.ts';

/** Repair only existing drafts from already recorded supplier data. No provider/AI/media calls. */
export async function repairStoredVariantSchemas(intake: IntakeState, products: ProductFactoryState,
  apply: (productId: string) => Promise<unknown>, limit = 20) {
  const candidates = new Map(intake.candidates.map(item => [item.id, item]));
  let repaired = 0, repairable = 0;
  for (const product of products.products) {
    const candidate = candidates.get(product.candidateId);
    if (product.status !== 'EM_PRODUCAO' || product.archivedAt || !candidate?.supplier?.variants?.length
      || ['ARQUIVADO', 'REJEITADO'].includes(candidate.status)) continue;
    // An empty/duplicate SKU cannot identify which variant should receive a field.
    const skus = candidate.supplier.variants.map(item => item.sku?.trim());
    if (skus.some(sku => !sku) || new Set(skus).size !== skus.length) continue;
    const preview = refreshProductSupplier(products, product.id, candidate, product.updatedAt, 'system:stored-variant-repair');
    const next = preview.products.find(item => item.id === product.id)!;
    if (JSON.stringify(next.spec?.variants) === JSON.stringify(product.spec?.variants ?? [])) continue;
    repairable++;
    if (repaired < limit) { await apply(product.id); repaired++; }
  }
  return { candidateCount: intake.candidates.length,
    candidatesWithVariants: intake.candidates.filter(item => item.supplier?.variants?.length).length,
    candidatesWithoutStructuredSupplier: intake.candidates.filter(item => !item.supplier).length,
    candidatesWithoutRecordedVariants: intake.candidates.filter(item => !item.supplier?.variants?.length).length,
    masterCount: products.products.length, mastersWithoutRecordedVariants: products.products.filter(item => !item.spec?.variants?.length).length,
    repairable, repaired, remaining: Math.max(0, repairable - repaired) };
}
