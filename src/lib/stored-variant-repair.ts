import type { IntakeState } from './intake.ts';
import { sameStoredValue } from './same-value.ts';
import { reconcileStoredProductVariants, type ProductFactoryState } from './product-factory.ts';

export function storedVariantDiagnostic(intake: IntakeState, products: ProductFactoryState) {
  const candidates = new Map(intake.candidates.map(item => [item.id, item]));
  const missing = products.products.filter(item => !item.spec?.variants?.length);
  const activeDrafts = missing.filter(item => item.status === 'EM_PRODUCAO' && !item.archivedAt);
  return { masterCount: products.products.length, missingVariants: missing.length,
    archivedMissingVariants: missing.filter(item => item.archivedAt).length,
    readyMissingVariants: missing.filter(item => item.status === 'PRONTO' && !item.archivedAt).length,
    activeDraftMissingVariants: activeDrafts.length,
    orphanMasterCount: missing.filter(item => !candidates.has(item.candidateId)).length,
    activeDraftSourcesWithVariants: activeDrafts.filter(item => candidates.get(item.candidateId)?.supplier?.variants?.length).length,
    activeDraftSourcesIneligible: activeDrafts.filter(item => ['ARQUIVADO', 'REJEITADO'].includes(candidates.get(item.candidateId)?.status ?? '')).length,
    orphanMastersWithSourceURL: missing.filter(item => !candidates.has(item.candidateId) && item.spec?.sourceUrl).length };
}

/** Reconcile existing sheets and false-ready legacy states from recorded data. No new production work. */
export async function repairStoredVariantSchemas(intake: IntakeState, products: ProductFactoryState,
  apply: (productId: string) => Promise<unknown>, limit = 200, applyBatch?: (productIds: string[]) => Promise<unknown>, approvedPhotos: Record<string, number> = {}) {
  let repaired = 0, repairable = 0; const targets: string[] = [];
  for (const product of products.products) {
    if (product.archivedAt) continue;
    const preview = reconcileStoredProductVariants(products, intake.candidates, [product.id], product.updatedAt, 'system:stored-variant-repair', approvedPhotos);
    const next = preview.products.find(item => item.id === product.id)!;
    if (sameStoredValue(next.spec?.variants, product.spec?.variants ?? []) && next.status === product.status) continue;
    repairable++;
    if (targets.length < limit) targets.push(product.id);
  }
  if (targets.length) { if (applyBatch) await applyBatch(targets); else for (const id of targets) await apply(id); repaired = targets.length; }
  return { candidateCount: intake.candidates.length,
    candidatesWithVariants: intake.candidates.filter(item => item.supplier?.variants?.length).length,
    candidatesWithoutStructuredSupplier: intake.candidates.filter(item => !item.supplier).length,
    candidatesWithStoredRawWithoutVariants: intake.candidates.filter(item => item.supplier?.rawData && !item.supplier?.variants?.length).length,
    candidatesWithoutRecordedVariants: intake.candidates.filter(item => !item.supplier?.variants?.length).length,
    masterCount: products.products.length, mastersWithoutRecordedVariants: products.products.filter(item => !item.spec?.variants?.length).length,
    repairable, repaired, remaining: Math.max(0, repairable - repaired) };
}
