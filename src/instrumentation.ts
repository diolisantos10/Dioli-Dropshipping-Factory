export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL || process.env.DDF_MEDIA_PAUSED !== 'true') return;
  // Aggregate diagnostics only. No URLs, product IDs, payloads, credentials or provider calls.
  try {
    const [{ readState }, { emptyIntake }, { emptyProductFactory }, { storedVariantDiagnostic }, { storedSheetComparison }] = await Promise.all([
      import('./lib/server-state'), import('./lib/intake'), import('./lib/product-factory'), import('./lib/stored-variant-repair'), import('./lib/stored-sheet-comparison'),
    ]);
    const [intake, products] = await Promise.all([readState('intake'), readState('products')]);
    console.info('DDF_STORED_VARIANT_DIAGNOSTIC', JSON.stringify(storedVariantDiagnostic(intake?.payload ?? emptyIntake, products?.payload ?? emptyProductFactory)));
    console.info('DDF_STORED_SHEET_COMPARISON', JSON.stringify(storedSheetComparison(intake?.payload ?? emptyIntake, products?.payload ?? emptyProductFactory, '1005013226256365')));
  } catch { console.info('DDF_STORED_VARIANT_DIAGNOSTIC', JSON.stringify({ code: 'stored_variant_diagnostic_unavailable' })); }
}
