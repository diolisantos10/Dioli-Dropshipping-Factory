export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL || process.env.DDF_MEDIA_PAUSED !== 'true') return;
  // Reconcile saved schemas through normal audited commands; never start provider/AI/media work.
  try {
    const [{ readState }, { emptyIntake }, { emptyProductFactory }, { storedVariantDiagnostic, repairStoredVariantSchemas }, { runServerCommand }, { emptyMedia, approvedStudioAssets }] = await Promise.all([
      import('./lib/server-state'), import('./lib/intake'), import('./lib/product-factory'), import('./lib/stored-variant-repair'), import('./lib/command-runner'), import('./lib/media-factory'),
    ]);
    const [intake, products, media] = await Promise.all([readState('intake'), readState('products'), readState('media')]);
    const origins = intake?.payload ?? emptyIntake, masters = products?.payload ?? emptyProductFactory;
    const identity = { role: 'SYSTEM', actor: 'system:stored-variant-schema-migration', correlationId: 'stored-variant-schema-migration' };
    const apply = (productIds: string[]) => runServerCommand('products.reconcileStoredVariants', { productIds }, identity);
    const repair = await repairStoredVariantSchemas(origins, masters, id => apply([id]), 200, apply,
      Object.fromEntries(masters.products.map((item: { id: string }) => [item.id, approvedStudioAssets(media?.payload ?? emptyMedia, item.id).length])));
    console.info('DDF_STORED_VARIANT_REPAIR', JSON.stringify(repair));
    const after = (await readState('products'))?.payload ?? emptyProductFactory;
    console.info('DDF_STORED_VARIANT_DIAGNOSTIC', JSON.stringify(storedVariantDiagnostic(origins, after)));
  } catch { console.info('DDF_STORED_VARIANT_DIAGNOSTIC', JSON.stringify({ code: 'stored_variant_diagnostic_unavailable' })); }
}
