import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import ts from 'typescript';
import { storedStudioOutcome } from '../src/lib/studio-outcome-diagnostic.ts';
const require = createRequire(import.meta.url);
function load(deps) {
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/factory-pilot.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name => name.startsWith('node:') ? require(name) : deps[name] ?? (name === './studio-outcome-diagnostic.ts' ? { storedStudioOutcome } : {}), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
function fixture(t, { candidate, prior } = {}) {
  const previous = process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID;
  const previousRetry = process.env.DDF_PILOT_RETRY_REVISION;
  delete process.env.DDF_PILOT_RETRY_REVISION;
  process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID = '1005013226256365';
  t.after(() => { if (previous === undefined) delete process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID; else process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID = previous; });
  t.after(() => { if (previousRetry === undefined) delete process.env.DDF_PILOT_RETRY_REVISION; else process.env.DDF_PILOT_RETRY_REVISION = previousRetry; });
  let saved, calls = 0;
  const products = [];
  const commandNames = [];
  const deps = {
    './server-state': { getDatabasePool: async () => ({ query: async (sql, args) => {
      if (sql.startsWith('SELECT detail')) return { rows: prior ? [{ detail: prior }] : [] };
      if (sql.startsWith('INSERT')) saved = JSON.parse(args[4]);
      if (sql.startsWith('UPDATE')) saved = JSON.parse(sql.includes('product_id=$2') ? args[2] : args[1]);
      return { rows: [] };
    } }), readState: async namespace => ({ payload: namespace === 'intake' ? { candidates: candidate ? [candidate] : [] } : { products, events: [] } }) },
    './command-runner': { runServerCommand: async (name, input) => {
      calls++; commandNames.push(name);
      if (input.supplier) candidate.supplier = input.supplier;
      if (name === 'intake.transition') candidate.status = input.status;
      if (name === 'products.start') products.push({ id: 'draft', candidateId: candidate.id, status: 'EM_PRODUCAO', spec: { variants: [] } });
    } },
    './product-factory': { emptyProductFactory: { products: [], events: [] } }, './intake': { emptyIntake: { candidates: [] } },
    './media-factory': { emptyMedia: { assets: [] }, approvedStudioAssets: () => [] },
    './pilot-source-diagnostic.ts': { sourceDiagnostic: (error, sourceUrls, step) => ({ message: error.message, stack: error.stack, sourceUrls, step }) },
    './ai-gateway': { GatewayError: class extends Error {}, generateGatewayText: async () => { throw new Error('Unexpected paid call'); } },
    './providers/supplier-stored.ts': { supplierForImageReading: value => value.supplier },
    './providers/supplier-attributes.ts': { resolveVisualAttributes: value => value.specifications ?? {} },
    './stored-variant-repair.ts': { repairStoredVariantSchemas: async () => ({ repaired: 0 }) },
    './same-value.ts': { sameStoredValue: (before, after) => JSON.stringify(before) === JSON.stringify(after) },
  };
  return { deps, products, commandNames, get saved() { return saved; }, get calls() { return calls; } };
}
test('media pause reads only pilot technical data and preserves failed studio history', async t => {
  const previous = process.env.DDF_MEDIA_PAUSED;
  process.env.DDF_MEDIA_PAUSED = 'true';
  t.after(() => { if (previous === undefined) delete process.env.DDF_MEDIA_PAUSED; else process.env.DDF_MEDIA_PAUSED = previous; });
  const prior = { failed: true, stage: 'STUDIO', code: 'studio_unsupported_view', studio: { results: [{ code: 'studio_unsupported_view' }] } };
  const snapshot = structuredClone(prior);
  const candidate = { id: 'pilot', status: 'CANDIDATO', supplier: { ref: '1005013226256365', images: ['https://ae01.alicdn.com/spec.jpg'] } };
  const fx = fixture(t, { candidate, prior });
  fx.deps['./providers/supplier-vision.ts'] = { SUPPLIER_VISION_REVISION: 2, readSupplierImages: async supplier => {
    assert.equal(candidate.supplier.technicalReadFailure.code, 'technical_source_read_interrupted');
    return { ...supplier, specifications: { 'Largura da lente': '57 mm' }, vision: { revision: 2, completed: true, processedImages: supplier.images } };
  } };
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.stage, 'TECHNICAL_DATA');
  assert.equal(result.mediaPaused, true);
  assert.equal(result.technicalAttributes, 1);
  assert.deepEqual(prior, snapshot);
  assert.equal(fx.saved, undefined);
  assert.equal(candidate.supplier.technicalReadFailure, undefined);
  const calls = fx.calls;
  await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(fx.calls, calls);
});
test('technical failure blocks another paid call while photos are paused', async t => {
  const previous = process.env.DDF_MEDIA_PAUSED;
  process.env.DDF_MEDIA_PAUSED = 'true';
  t.after(() => { if (previous === undefined) delete process.env.DDF_MEDIA_PAUSED; else process.env.DDF_MEDIA_PAUSED = previous; });
  const candidate = { id: 'pilot', status: 'CANDIDATO', supplier: { ref: '1005013226256365', images: ['https://ae01.alicdn.com/spec.jpg'] } };
  const fx = fixture(t, { candidate });
  let reads = 0;
  fx.deps['./providers/supplier-vision.ts'] = { SUPPLIER_VISION_REVISION: 2, readSupplierImages: async () => { reads++; throw new Error('private provider response'); } };
  await load(fx.deps).runFactoryPilot('cron', 'corr');
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(reads, 1);
  assert.equal(result.blocked, 1);
  assert.ok(!JSON.stringify(result).includes('private provider response'));
});
test('supplier selection is deterministic and refuses ambiguous integrations', () => {
  const { selectPilotSupplier } = load({});
  const suppliers = [{ id: 'a', name: 'Other' }, { id: 'b', name: 'Sanchio' }];
  assert.equal(selectPilotSupplier(suppliers).id, 'b');
  assert.equal(selectPilotSupplier(suppliers, 'other').id, 'a');
  assert.equal(selectPilotSupplier(suppliers, 'missing'), undefined);
  assert.equal(selectPilotSupplier([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]), undefined);
});
test('rejected pilot does not change authorization or call supplier and AI', async t => {
  const fx = fixture(t, { candidate: { id: 'c', status: 'REJEITADO', url: 'https://pt.aliexpress.com/item/1005013226256365.html' } });
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.code, 'pilot_origin_ineligible');
  assert.equal(fx.calls, 0);
});
test('failed paid checkpoint is never automatically retried', async t => {
  const fx = fixture(t, { prior: { failed: true, stage: 'SOURCE', code: 'gateway_provider_access_denied' } });
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.reason, 'pilot_failed_requires_review');
  assert.equal(fx.calls, 0);
});
test('pilot enters triage and factory before partial source reading without final approval or generation', async t => {
  const candidate = { id: 'c', status: 'CANDIDATO', supplier: { ref: '1005013226256365', images: Array.from({ length: 9 }, (_, i) => `https://ae01.alicdn.com/${i}.png`) } };
  const fx = fixture(t, { candidate, prior: { candidateId: 'c' } });
  let reads = 0;
  fx.deps['./providers/supplier-vision.ts'] = { readSupplierImages: async supplier => { reads++; return { ...supplier, vision: { processedImages: supplier.images.slice(0, 8), completed: false } }; } };
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.stage, 'SOURCE');
  assert.equal(result.sourceRead, 8);
  assert.equal(result.sourceCount, 9);
  assert.equal(result.continuing, 1);
  assert.equal(candidate.status, 'APROVADO');
  assert.equal(fx.products[0].status, 'EM_PRODUCAO');
  assert.equal(fx.saved.productId, 'draft');
  assert.deepEqual(fx.commandNames, ['intake.transition', 'intake.transition', 'products.start', 'intake.refreshSupplier']);
  assert.equal(fx.calls, 4);
  assert.equal(reads, 1);
});

test('failed source pilot progresses through audited triage to a visible draft without repeating paid work', async t => {
  const prior = { candidateId: 'c', failed: true, stage: 'SOURCE', code: 'pilot_step_failed', sourceCount: 49, sourceRead: 0 };
  const candidate = { id: 'c', status: 'CANDIDATO', supplier: { ref: '1005013226256365', images: [] } };
  const fx = fixture(t, { candidate, prior });
  fx.deps['./providers/supplier-vision.ts'] = { readSupplierImages: async () => assert.fail('Consumed source read must not repeat') };
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.blocked, 1);
  assert.equal(fx.products.length, 1);
  assert.deepEqual(fx.commandNames, ['intake.transition', 'intake.transition', 'products.start']);
  assert.deepEqual(fx.saved, { ...prior, productId: 'draft' });
  assert.equal(fx.saved.failed, true);
  assert.equal(fx.saved.code, 'pilot_step_failed');
  const calls = fx.calls;
  await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(fx.calls, calls, 'admission is idempotent');
});

test('failed source admission never changes rejected, archived or information-requested origins', async t => {
  for (const status of ['REJEITADO', 'ARQUIVADO', 'INFORMACAO_SOLICITADA']) {
    const fx = fixture(t, { candidate: { id: 'c', status, supplier: { ref: '1005013226256365' } },
      prior: { candidateId: 'c', failed: true, stage: 'SOURCE', code: 'pilot_step_failed' } });
    await load(fx.deps).runFactoryPilot('cron', 'corr');
    assert.equal(fx.calls, 0);
    assert.equal(fx.saved, undefined);
  }
});

test('single diagnostic retry retains the provider response and exception and cannot repeat the consumed revision', async t => {
  const candidate = { id: 'c', status: 'APROVADO', supplier: { ref: '1005013226256365', images: ['https://ae01.alicdn.com/one.webp', 'https://ae01.alicdn.com/two.webp'] } };
  const fx = fixture(t, { candidate, prior: { candidateId: 'c', failed: true, stage: 'SOURCE', code: 'pilot_step_failed' } });
  process.env.DDF_PILOT_RETRY_REVISION = 'source-diagnostic-single-1';
  let calls = 0;
  fx.deps['./ai-gateway'].generateGatewayText = async () => { calls++; return { text: 'invalid-json', providerId: 'provider', modelId: 'model' }; };
  fx.deps['./providers/supplier-vision.ts'] = { SUPPLIER_VISION_REVISION: 2, readSupplierImages: async (_supplier, _ref, generate, options) => {
    assert.equal(options.batchSize, 1);
    await generate({});
    assert.equal(fx.saved.failed, true, 'interrupted diagnostic cannot auto retry');
    assert.equal(fx.saved.sourceResponse.text, 'invalid-json', 'response retained before parsing');
    throw new Error('Leitura visual devolveu JSON inválido');
  } };
  await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(calls, 1);
  assert.equal(fx.saved.sourceDiagnostic.step, 'response_validation');
  assert.match(fx.saved.sourceDiagnostic.message, /JSON inválido/);
  assert.deepEqual(fx.saved.sourceDiagnostic.sourceUrls, ['https://ae01.alicdn.com/one.webp']);
  assert.equal(fx.saved.sourceFailureHistory[0].code, 'pilot_step_failed');
  const second = fixture(t, { candidate, prior: fx.saved });
  process.env.DDF_PILOT_RETRY_REVISION = 'source-diagnostic-single-1';
  await load(second.deps).runFactoryPilot('cron', 'corr');
  assert.equal(second.calls, 0);
});

test('one-photo limit stops additional paid work after the first independently approved image', async t => {
  const previous = process.env.DDF_PILOT_MAX_APPROVED_PHOTOS;
  process.env.DDF_PILOT_MAX_APPROVED_PHOTOS = '1';
  t.after(() => { if (previous === undefined) delete process.env.DDF_PILOT_MAX_APPROVED_PHOTOS; else process.env.DDF_PILOT_MAX_APPROVED_PHOTOS = previous; });
  const candidate = { id: 'c', status: 'APROVADO', supplier: { ref: '1005013226256365' } };
  const fx = fixture(t, { candidate, prior: { candidateId: 'c', productId: 'draft' } });
  fx.products.push({ id: 'draft', candidateId: 'c', status: 'EM_PRODUCAO' });
  fx.deps['./media-factory'].approvedStudioAssets = () => [{ id: 'approved-one' }];
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.code, 'pilot_single_photo_verified');
  assert.equal(result.approvedPhotos, 1);
  assert.equal(fx.calls, 0);
});

test('operator revision consumes exactly one SOURCE routing retry and another failure freezes', async t => {
  const candidate = { id: 'c', status: 'CANDIDATO', supplier: { ref: '1005013226256365', images: ['https://ae01.alicdn.com/source.png'] } };
  const fx = fixture(t, { candidate, prior: { candidateId: 'c', failed: true, stage: 'SOURCE', code: 'gateway_provider_invalid_request' } });
  process.env.DDF_PILOT_RETRY_REVISION = 'routing-repair-1';
  let reads = 0;
  fx.deps['./providers/supplier-vision.ts'] = { readSupplierImages: async () => {
    reads++;
    assert.equal(fx.saved.retryRevision, 'routing-repair-1');
    assert.equal(fx.saved.failed, true, 'reset is consumed before gateway call');
    const error = new fx.deps['./ai-gateway'].GatewayError('routing rejected');
    error.code = 'gateway_provider_invalid_request';
    throw error;
  } };
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.failed, 1);
  assert.equal(reads, 1);
  assert.equal(Boolean(fx.saved.failed), true);
  assert.equal(fx.saved.retryRevision, 'routing-repair-1');
  const second = fixture(t, { candidate, prior: fx.saved });
  process.env.DDF_PILOT_RETRY_REVISION = 'routing-repair-1';
  second.deps['./providers/supplier-vision.ts'] = { readSupplierImages: async () => assert.fail('Revision must not repeat') };
  assert.equal((await load(second.deps).runFactoryPilot('cron', 'corr')).reason, 'pilot_failed_requires_review');
});

test('operator revision cannot reset paid STUDIO or access and budget failures', async t => {
  for (const [stage, code] of [['STUDIO', 'gateway_provider_invalid_request'], ['SOURCE', 'gateway_provider_access_denied'], ['SOURCE', 'gateway_provider_budget_exceeded']]) {
    const fx = fixture(t, { prior: { failed: true, stage, code } });
    process.env.DDF_PILOT_RETRY_REVISION = 'routing-repair-2';
    assert.equal((await load(fx.deps).runFactoryPilot('cron', 'corr')).reason, 'pilot_failed_requires_review');
    assert.equal(fx.calls, 0);
  }
});

test('reviewed vision latency repair retries SOURCE timeout once with its explicit revision only', async t => {
  const candidate = { id: 'c', status: 'CANDIDATO', supplier: { ref: '1005013226256365', images: ['https://ae01.alicdn.com/source.png'] } };
  for (const code of ['gateway_unavailable', 'gateway_provider_timeout']) {
    const denied = fixture(t, { candidate, prior: { candidateId: 'c', failed: true, stage: 'SOURCE', code } });
    process.env.DDF_PILOT_RETRY_REVISION = 'routing-repair-2';
    assert.equal((await load(denied.deps).runFactoryPilot('cron', 'corr')).reason, 'pilot_failed_requires_review');
    const fx = fixture(t, { candidate, prior: { candidateId: 'c', failed: true, stage: 'SOURCE', code } });
    process.env.DDF_PILOT_RETRY_REVISION = 'vision-latency-repair-1';
    let reads = 0;
    fx.deps['./providers/supplier-vision.ts'] = { readSupplierImages: async () => {
      reads++;
      assert.equal(fx.saved.retryRevision, 'vision-latency-repair-1');
      const error = new fx.deps['./ai-gateway'].GatewayError('timed out'); error.code = code; throw error;
    } };
    const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
    assert.equal(result.failed, 1);
    assert.equal(result.sourceCount, 1);
    assert.equal(result.sourceRead, 0);
    assert.equal(reads, 1);
    const second = fixture(t, { candidate, prior: fx.saved });
    process.env.DDF_PILOT_RETRY_REVISION = 'vision-latency-repair-1';
    assert.equal((await load(second.deps).runFactoryPilot('cron', 'corr')).reason, 'pilot_failed_requires_review');
  }
});

test('stored failed studio reveals only its safe code and technical gap labels without paid retry', async t => {
  const fx = fixture(t, { prior: { productId: 'pilot', failed: true, stage: 'STUDIO', sourceCount: 17, sourceRead: 17 } });
  fx.deps['./server-state'].readState = async namespace => ({ payload: namespace === 'media'
    ? { assets: [], productionRequests: [{ productId: 'pilot', status: 'FALHOU', error: 'Produção não concluída (studio_variant_mismatch); nenhuma foto foi presumida aprovada.' }] }
    : { products: [{ id: 'pilot' }], events: [] } });
  fx.deps['./media-factory'] = { approvedStudioAssets: () => [] };
  fx.deps['./product-factory'].productGaps = () => ['Peso confirmado de cada item', 'Dimensões confirmadas de cada item', 'PRIVATE PRODUCT FIELD'];
  const logs = [], priorLog = console.info;
  console.info = (...args) => logs.push(args.join(' ')); t.after(() => { console.info = priorLog; });
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.code, 'studio_variant_mismatch');
  assert.equal(result.sourceRead, 17); assert.equal(result.gapCount, 2);
  assert.deepEqual(result.gaps, ['Peso confirmado de cada item', 'Dimensões confirmadas de cada item']);
  assert.equal(fx.calls, 0); assert.ok(logs.every(line => !line.includes('PRIVATE')));
  assert.equal(load({}).storedStudioFailureCode('Produção não concluída (secret_value); nenhuma foto foi presumida aprovada.'), undefined);
});

test('studio reference aggregates distinguish missing source assets from fully inspected unsupported angles without exposing identity', () => {
  const pilot = load({ './supplier-media-archive': { archiveSourceAllowed: value => value.startsWith('https://ae01.alicdn.com/') } });
  const media = { assets: [
    { id: 'a', productId: 'pilot', kind: 'ORIGINAL', status: 'APROVADA', sourceUrl: 'https://ae01.alicdn.com/a.jpg', url: 'https://ddf.example/api/media?id=a' },
    { id: 'b', productId: 'pilot', kind: 'ORIGINAL', status: 'APROVADA', url: 'https://untrusted.example/b.jpg' },
    { id: 'c', productId: 'other', kind: 'ORIGINAL', status: 'APROVADA', url: 'https://ae01.alicdn.com/c.jpg' },
  ], productionRequests: [{ productId: 'pilot', sourceAssetIds: ['a', 'b', 'missing'], sourceAssessment: { processedSourceAssetIds: ['a', 'b', 'missing'], supportedSourceAssetIds: [], variantIdentity: 'PRIVATE VARIANT' } }] };
  const result = pilot.pilotStudioReferenceSummary(media, 'pilot');
  assert.deepEqual(result, { requestReferenceCount: 3, availableApprovedCount: 2, sourceMimeCounts: { jpeg: 0, png: 0, webp: 0, avif: 0, other: 2 }, allowedReferenceCount: 1, assessmentProcessedCount: 3, assessmentSupportedCount: 0, assessmentHasVariant: true, reviewMentionsFrontal: false, reviewMentionsNoVisualEvidence: false, reviewMentionsQuality: false, reviewMentionsVariantConflict: false, reviewReportsUnavailableImages: false });
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  media.productionRequests[0].sourceAssessment.evidence = ['Não consigo visualizar as imagens PRIVATE PROVIDER EVIDENCE'];
  const unavailable = pilot.pilotStudioReferenceSummary(media, 'pilot');
  assert.equal(unavailable.reviewReportsUnavailableImages, true);
  assert.ok(!JSON.stringify(unavailable).includes('PRIVATE'));
});

