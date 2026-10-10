import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePilotProgress, pilotProgress, runPilot } from '../scripts/pilot.mjs';

const token = 'secret-token-never-log-12345678901234567890';
const body = detail => ({ results: [{ task: 'factoryPilot', status: 'SUCCEEDED', detail }] });
function harness(replies) {
  const logs = [], requests = [];
  let clock = 0;
  return { logs, requests, options: { baseUrl: 'https://ddf.example', token, log: value => logs.push(value), now: () => clock,
    wait: async ms => { clock += ms; }, fetchImpl: async (url, init) => {
      requests.push({ url, init }); const next = replies.shift(); assert.ok(next, 'No extra calls are allowed');
      return { status: next.status ?? 200, ok: (next.status ?? 200) === 200, json: async () => next.body };
    } } };
}

test('pilot stops immediately on failed source and never logs credentials or supplier payload', async () => {
  const h = harness([{ body: body({ stage: 'SOURCE', sourceCount: 20, sourceRead: 0, failed: 1, code: 'gateway_unavailable', privateSupplier: 'private-product-data' }) }]);
  const result = await runPilot(h.options);
  assert.equal(result.reason, 'requires_review'); assert.equal(h.requests.length, 1);
  assert.deepEqual(JSON.parse(h.requests[0].init.body), { tasks: ['factoryPilot'] });
  assert.equal(h.requests[0].init.headers.authorization, `Bearer ${token}`);
  assert.ok(h.logs.every(line => !line.includes(token) && !line.includes('private-product-data')));
});

test('pilot resumes only demonstrated progress and stops at four photos even with technical gaps', async () => {
  const h = harness([
    ...[8,16,20].map(sourceRead => ({ body: body({ stage: 'SOURCE', sourceCount: 20, sourceRead }) })),
    ...[1,2,3,4].map(approvedPhotos => ({ body: body({ stage: 'STUDIO', sourceCount: 20, sourceRead: 20, approvedPhotos, gapCount: 2 }) })),
  ]);
  const result = await runPilot(h.options);
  assert.equal(result.reason, 'four_photos'); assert.equal(result.calls, 7); assert.equal(result.progress.gapCount, 2);
});

test('repeated progress stops rather than generating another request', async () => {
  const reply = { body: body({ stage: 'SOURCE', sourceCount: 20, sourceRead: 8 }) };
  const h = harness([reply, reply]);
  assert.equal((await runPilot(h.options)).reason, 'no_progress'); assert.equal(h.requests.length, 2);
});

test('studio inspection cursor progress continues but codes always stop', () => {
  const a = pilotProgress(body({ stage: 'STUDIO', sourceRead: 20, studio: { results: [{ inspected: 15 }] } }));
  const b = pilotProgress(body({ stage: 'STUDIO', sourceRead: 20, studio: { results: [{ inspected: 20 }] } }));
  assert.equal(decidePilotProgress(b,a), 'continue');
  assert.equal(decidePilotProgress({ ...b, code: 'studio_execution_failed' },a), 'requires_review');
});

test('overlapping normal automation waits at most twelve checks without invoking paid work', async () => {
  const h = harness(Array.from({ length: 12 }, () => ({ status: 409 })));
  const result = await runPilot(h.options);
  assert.equal(result.reason, 'automation_busy'); assert.equal(result.calls, 0); assert.equal(h.requests.length, 12);
});

test('runner cannot exceed twelve successful invocations', async () => {
  const h = harness(Array.from({ length: 12 }, (_, i) => ({ body: body({ stage: 'SOURCE', sourceCount: 200, sourceRead: i + 1 }) })));
  const result = await runPilot(h.options);
  assert.equal(result.reason, 'invocation_limit'); assert.equal(result.calls, 12);
});

test('ten-minute wall limit stops new requests and fetch exceptions never expose secrets', async () => {
  let clock = 0, calls = 0;
  const limited = await runPilot({ baseUrl: 'https://ddf.example', token, log: () => {}, now: () => clock,
    fetchImpl: async () => { calls++; clock = 600_001; return { status: 200, ok: true, json: async () => body({ stage: 'SOURCE', sourceRead: 8, sourceCount: 20 }) }; } });
  assert.equal(limited.reason, 'time_limit'); assert.equal(calls, 1);
  const logs = [];
  const failed = await runPilot({ baseUrl: 'https://ddf.example', token, log: line => logs.push(line),
    fetchImpl: async () => { throw new Error(`Failed request Bearer ${token}`); } });
  assert.equal(failed.reason, 'request_failed'); assert.ok(logs.every(line => !line.includes(token)));
});
