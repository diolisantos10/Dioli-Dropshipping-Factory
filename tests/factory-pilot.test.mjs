import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(deps) {
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/factory-pilot.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name => name.startsWith('node:') ? require(name) : deps[name] ?? {}, module, module.exports);
  return module.exports;
}
function fixture(t, { candidate, prior } = {}) {
  const previous = process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID;
  const previousRetry = process.env.DDF_PILOT_RETRY_REVISION;
  delete process.env.DDF_PILOT_RETRY_REVISION;
  process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID = '1005013226256365';
  t.after(() => { if (previous === undefined) delete process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID; else process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID = previous; });
  t.after(() => { if (previousRetry === undefined) delete process.env.DDF_PILOT_RETRY_REVISION; else process.env.DDF_PILOT_RETRY_REVISION = previousRetry; });
  let saved, calls = 0;
  const deps = {
    './server-state': { getDatabasePool: async () => ({ query: async (sql, args) => {
      if (sql.startsWith('SELECT detail')) return { rows: prior ? [{ detail: prior }] : [] };
      if (sql.startsWith('INSERT')) saved = JSON.parse(args[4]);
      if (sql.startsWith('UPDATE')) saved = JSON.parse(args[1]);
      return { rows: [] };
    } }), readState: async namespace => ({ payload: namespace === 'intake' ? { candidates: candidate ? [candidate] : [] } : { products: [], events: [] } }) },
    './command-runner': { runServerCommand: async (_name, input) => { calls++; if (input.supplier) candidate.supplier = input.supplier; } },
    './product-factory': { emptyProductFactory: { products: [], events: [] } }, './intake': { emptyIntake: { candidates: [] } },
    './ai-gateway': { GatewayError: class extends Error {}, generateGatewayText: async () => { throw new Error('Unexpected paid call'); } },
    './providers/supplier-stored.ts': { supplierForImageReading: value => value.supplier },
  };
  return { deps, get saved() { return saved; }, get calls() { return calls; } };
}
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
test('partial gallery checkpoints source reading without approving or generating', async t => {
  const candidate = { id: 'c', status: 'CANDIDATO', supplier: { ref: '1005013226256365', images: Array.from({ length: 9 }, (_, i) => `https://ae01.alicdn.com/${i}.png`) } };
  const fx = fixture(t, { candidate, prior: { candidateId: 'c' } });
  let reads = 0;
  fx.deps['./providers/supplier-vision.ts'] = { readSupplierImages: async supplier => { reads++; return { ...supplier, vision: { processedImages: supplier.images.slice(0, 8), completed: false } }; } };
  const result = await load(fx.deps).runFactoryPilot('cron', 'corr');
  assert.equal(result.stage, 'SOURCE');
  assert.equal(result.sourceRead, 8);
  assert.equal(result.sourceCount, 9);
  assert.equal(result.continuing, 1);
  assert.equal(candidate.status, 'CANDIDATO');
  assert.equal(fx.calls, 1);
  assert.equal(reads, 1);
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
  assert.deepEqual(result, { requestReferenceCount: 3, availableApprovedCount: 2, allowedReferenceCount: 1, assessmentProcessedCount: 3, assessmentSupportedCount: 0, assessmentHasVariant: true });
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
