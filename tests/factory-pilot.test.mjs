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
  process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID = '1005013226256365';
  t.after(() => { if (previous === undefined) delete process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID; else process.env.DDF_PILOT_ALIEXPRESS_ITEM_ID = previous; });
  let saved, calls = 0;
  const deps = {
    './server-state': { getDatabasePool: async () => ({ query: async (sql, args) => {
      if (sql.startsWith('SELECT detail')) return { rows: prior ? [{ detail: prior }] : [] };
      if (sql.startsWith('INSERT')) saved = JSON.parse(args[4]);
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
