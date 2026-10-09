import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import ts from 'typescript';
import { readSupplierImages } from '../src/lib/providers/supplier-vision.ts';
import { GatewayError } from '../src/lib/ai-gateway.ts';
import { supplierForImageReading } from '../src/lib/providers/supplier-stored.ts';

const require = createRequire(import.meta.url);
// Execute the actual worker with isolated database and transports. The OCR parser remains real.
function worker(generate, legacy = false) {
  const photo = 'https://ae01.alicdn.com/measurement.jpg';
  const candidate = { id: 'real-source', status: 'NOVO', url: 'https://www.aliexpress.com/item/1005001.html', supplier: {
    name: 'Loja', ref: '1005001', cost: 10, currency: 'BRL', stock: 1, imageUrl: photo, images: [photo], variants: [],
  } };
  if (legacy) { candidate.notes = `Fornecedor: Loja\nReferência: 1005001\nCusto informado: BRL 10.00\nImagem: ${photo}`; delete candidate.supplier; }
  const writes = [];
  const deps = {
    './ai-gateway': { GatewayError, gatewayConfigurationStatus: () => ({ configured: true }), generateGatewayText: generate },
    './command-runner': { runServerCommand: async (type, input) => { writes.push({ type, input }); return { payload: { candidates: [candidate] } }; } },
    './server-state': { readState: async () => ({ payload: { candidates: [candidate] } }), getDatabasePool: async () => ({ query: async () => ({ rows: [{ id: 'integration-1' }] }) }) },
    './integrations': { getSupplierAdapterForIntegration: async () => { throw new Error('AliExpress IllegalRefreshToken'); } },
    './providers/supplier-content.ts': { SUPPLIER_IMPORT_REVISION: 2 },
    './providers/supplier-vision.ts': { readSupplierImages },
    './providers/supplier-stored.ts': { supplierForImageReading },
  };
  const source = readFileSync(new URL('../src/lib/factory-production.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const workerModule = { exports: {} };
  new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name => name.startsWith('node:') ? require(name) : deps[name] ?? {}, workerModule, workerModule.exports);
  return { enrich: workerModule.exports.enrichRawCandidates, writes, photo };
}

test('renovação recusada pelo AliExpress não interrompe OCR das fotos importadas', async () => {
  const { enrich, writes, photo } = worker(async request => {
    assert.equal(request.roleAddress, 'dioli.ddf.supplier-import');
    return { text: JSON.stringify({ facts: [{ imageUrl: photo, sku: null, quote: 'Net weight: 200 g' }] }) };
  });
  const result = await enrich('system', 'correlation');
  assert.equal(result.blocked, 1);
  assert.match(result.reason, /reconecte/);
  assert.equal(result.vision.results[0].status, 'SUCCEEDED');
  assert.equal(writes[0].type, 'intake.refreshSupplier');
  assert.equal(writes[0].input.supplier.weightGrams, 200);
  assert.equal(writes[0].input.supplier.vision.completed, true);
});

test('importação antiga lê a imagem das observações sem fingir nova consulta ao fornecedor', async () => {
  const { enrich, writes, photo } = worker(async () => ({ text: JSON.stringify({ facts: [{ imageUrl: photo, sku: null, quote: 'Width: 12 cm' }] }) }), true);
  const result = await enrich('system', 'correlation');
  assert.equal(result.vision.checked, 1);
  assert.equal(writes[0].input.supplier.ref, '1005001');
  assert.equal(writes[0].input.supplier.dimensions.widthCm, 12);
  assert.equal(writes[0].input.supplier.importRevision, undefined);
});

test('falha da OpenAI é contada e não marca foto como analisada nem expõe erro privado', async () => {
  const { enrich, writes } = worker(async () => { throw new GatewayError('gateway_policy_blocked', 'private-provider-detail'); });
  const result = await enrich('system', 'correlation');
  assert.equal(result.vision.failed, 1);
  assert.equal(result.vision.remaining, 1);
  assert.equal(result.vision.results[0].code, 'gateway_policy_blocked');
  assert.equal(writes.length, 0);
  assert.equal(JSON.stringify(result).includes('private-provider-detail'), false);
});
