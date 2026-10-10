import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(deps = {}) {
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/supplier-media-archive.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Script(`(function(require,module,exports){${code}\n})`).runInThisContext()(name => name.startsWith('node:') ? require(name) : deps[name] ?? {}, module, module.exports);
  return module.exports;
}
test('archive whitelist requires exact supplier CDN domain, HTTPS, no credentials or alternate ports', () => {
  const { archiveSourceAllowed, archiveHostClass } = load();
  assert.equal(archiveSourceAllowed('https://ae01.alicdn.com/photo.jpg'), true);
  assert.equal(archiveSourceAllowed('https://ae-pic-a1.aliexpress-media.com/photo.jpg'), true);
  for (const url of ['http://ae01.alicdn.com/a.jpg', 'https://127.0.0.1/a.jpg', 'https://alicdn.com.attacker.example/a.jpg', 'https://aliexpress-media.com.attacker.example/a.jpg', 'https://user:pass@ae01.alicdn.com/a.jpg', 'https://ae01.alicdn.com:8443/a.jpg']) assert.equal(archiveSourceAllowed(url), false);
  assert.equal(archiveHostClass('https://ae-pic-a1.aliexpress-media.com/a.jpg'), 'aliexpress_media');
  assert.equal(archiveHostClass('https://alicdn.com.attacker.example/a.jpg'), 'other');
});
test('database failures expose only allowlisted schema and permission classifications', () => {
  const { archiveFailureCode } = load();
  assert.equal(archiveFailureCode({ code: '42P01', message: 'PRIVATE TABLE NAME' }, 'persistence'), 'persistence_schema_missing');
  assert.equal(archiveFailureCode({ code: '42501', message: 'PRIVATE CREDENTIAL' }, 'persistence'), 'persistence_permission');
  assert.equal(archiveFailureCode({ code: '22P02', message: 'PRIVATE ASSET ID' }, 'persistence'), 'persistence_invalid_identifier');
  assert.equal(archiveFailureCode({ code: 'arbitrary-secret' }, 'persistence'), 'persistence');
});
test('archive reports bounded failure classes without source URLs, IDs, content or raw exceptions', async t => {
  const oldFetch = globalThis.fetch, oldPublic = process.env.DDF_PUBLIC_URL, oldInfo = console.info;
  process.env.DDF_PUBLIC_URL = 'https://ddf.example';
  const logs = [];
  console.info = (...args) => logs.push(args.join(' '));
  t.after(() => { globalThis.fetch = oldFetch; console.info = oldInfo; if (oldPublic === undefined) delete process.env.DDF_PUBLIC_URL; else process.env.DDF_PUBLIC_URL = oldPublic; });
  const variants = ['not-allowed', 'http', 'mime', 'size', 'timeout', 'persistence'];
  const assets = variants.map((variant, i) => ({ id: `private-${i}`, productId: 'pilot', kind: 'ORIGINAL', purpose: 'PRIVATE PRODUCT NAME', url: `https://${variant === 'not-allowed' ? 'untrusted.example' : 'ae01.alicdn.com'}/${variant}.jpg` }));
  globalThis.fetch = async (url, init) => {
    assert.equal(init.redirect, 'manual');
    if (url.includes('timeout')) { const error = new Error('secret upstream details'); error.name = 'TimeoutError'; throw error; }
    const key = url.includes('/http.') ? 'http' : url.includes('/mime.') ? 'mime' : 'size';
    return { ok: key !== 'http', status: 403, headers: new Headers({ 'content-type': key === 'mime' ? 'text/html' : 'image/jpeg', 'content-length': '10000001' }), body: {} };
  };
  const worker = load({ './server-state': { readState: async () => ({ payload: { assets } }), getDatabasePool: async () => ({ query: async (_sql, args) => {
    if (args[0].includes('persistence')) throw new Error('password=SECRET DATABASE'); return { rows: [] };
  } }) } });
  const result = await worker.persistSupplierOriginals('pilot', 'corr');
  assert.equal(result.archived, 0); assert.equal(result.remaining, 6);
  assert.deepEqual(result.failureCodes, { origin_not_allowed: 1, http_403: 1, invalid_mime: 1, oversize: 1, timeout: 1, persistence: 1 });
  assert.deepEqual(result.failureHosts, { other: 1, alicdn: 5 });
  assert.ok(logs.every(log => !/PRIVATE|SECRET|https:|private-|upstream/.test(log)));
});
