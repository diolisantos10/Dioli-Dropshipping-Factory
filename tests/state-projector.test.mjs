import test from 'node:test';
import assert from 'node:assert/strict';
import { projectState } from '../src/lib/state-projector.ts';

test('media projection converts legacy original keys into stable UUIDs without changing state references or generated UUIDs', async () => {
  const originalId = 'product-original-1';
  const generatedId = '87d0f539-199a-4e97-ad25-388fcbe5cc6f';
  const payload = { assets: [
    { id: originalId, productId: 'product', kind: 'ORIGINAL', checksum: 'original-hash', url: 'https://ddf.example/api/media?id=blob', provenance: 'AliExpress original' },
    { id: generatedId, productId: 'product', kind: 'DERIVADA', checksum: 'generated-hash', url: 'https://ddf.example/api/media?id=generated-blob', originalAssetId: originalId, sourceAssetIds: [originalId], provenance: 'Verified studio' },
    { id: 'still-not-archived', productId: 'product', kind: 'ORIGINAL', url: 'https://ae01.alicdn.com/a.jpg' },
  ] };
  const snapshot = structuredClone(payload);
  const rows = new Map();
  const calls = [];
  const client = { query: async (sql, values) => {
    assert.match(sql, /INSERT INTO media_assets/);
    assert.match(values[0], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'relational column accepts UUIDs');
    calls.push(values); rows.set(values[0], values); return { rows: [] };
  } };
  await projectState(client, 'media', payload, 'system:test');
  const projectedOriginalId = calls[0][0];
  assert.notEqual(projectedOriginalId, originalId);
  assert.equal(calls[1][0], generatedId);
  assert.equal(calls[0][9], snapshot.assets[0].provenance);
  await projectState(client, 'media', payload, 'system:test');
  assert.equal(calls[2][0], projectedOriginalId, 'repeat projection uses exactly the same legacy mapping');
  assert.equal(calls[3][0], generatedId);
  assert.equal(rows.size, 2, 'repeated projections cannot duplicate originals or generated assets');
  assert.deepEqual(payload, snapshot, 'state IDs, provenance and originalAssetId/sourceAssetIds stay unchanged');
});
