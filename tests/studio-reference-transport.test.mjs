import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { archivedStudioReference, normalizedStudioRaster } from '../src/lib/studio-reference-transport.ts';
import { canRetryStudioInspection, retryStudioInspection, STUDIO_ARCHIVED_WEBP_REPAIR } from '../src/lib/media-production-queue.ts';
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');

test('WebP transport becomes PNG with exactly the decoded pixels and dimensions; original remains intact', async () => {
  const original = await sharp({ create: { width: 83, height: 47, channels: 4, background: { r: 17, g: 61, b: 123, alpha: 0.7 } } }).webp({ lossless: true }).toBuffer();
  const snapshot = Buffer.from(original);
  const uri = await normalizedStudioRaster(original, checksum(original));
  assert.match(uri, /^data:image\/png;base64,/);
  const output = Buffer.from(uri.split(',')[1], 'base64');
  const before = await sharp(original).raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  assert.equal(after.info.width, 83); assert.equal(after.info.height, 47);
  assert.deepEqual(after.data, before.data); assert.deepEqual(original, snapshot);
});

test('confirmed WebP delivery repair is once-only, audited, and cannot reset generated, fidelity or billing failures', () => {
  const assessment = { angle: 'frontal', variantIdentity: '', processedSourceAssetIds: ['original'], supportedSourceAssetIds: [], evidence: ['Original inspection'] };
  const state = { assets: [{ id: 'original', productId: 'pilot', kind: 'ORIGINAL', status: 'APROVADA', sourceUrl: 'https://ae01.alicdn.com/a.webp', mimeType: 'image/webp', checksum: 'a'.repeat(64) }], productionRequests: [{ id: 'request', productId: 'pilot', status: 'FALHOU', sourceAssetIds: ['original'], sourceAssessment: assessment,
    error: 'Produção não concluída (studio_unsupported_view); nenhuma foto foi presumida aprovada.', inspectionRetryHistory: [
      { revision: 'studio-source-selection-repair-1', assessment, error: 'first' },
      { revision: 'studio-empty-variant-repair-1', assessment, error: 'second' },
    ] }] };
  assert.equal(canRetryStudioInspection(state, 'request', STUDIO_ARCHIVED_WEBP_REPAIR), true);
  const repaired = retryStudioInspection(state, 'request', STUDIO_ARCHIVED_WEBP_REPAIR, '2026-10-11T11:50:00Z', 'system:reviewed-webp-transport-repair');
  assert.equal(repaired.productionRequests[0].inspectionRetryHistory.length, 3);
  assert.deepEqual(repaired.productionRequests[0].inspectionRetryHistory[2].assessment, assessment);
  assert.equal(canRetryStudioInspection(repaired, 'request', STUDIO_ARCHIVED_WEBP_REPAIR), false);
  for (const mutate of [
    s => { s.assets.push({ id: 'paid', productId: 'pilot', kind: 'DERIVADA', studio: true }); },
    s => { s.assets[0].mimeType = 'image/jpeg'; },
    s => { s.assets[0].checksum = ''; },
    s => { s.productionRequests[0].sourceAssessment.supportedSourceAssetIds = ['original']; },
    s => { s.productionRequests[0].error = 'Produção não concluída (studio_variant_mismatch); nenhuma foto foi presumida aprovada.'; },
    s => { s.productionRequests[0].error = 'Produção não concluída (gateway_provider_budget_exceeded); nenhuma foto foi presumida aprovada.'; },
  ]) { const changed = structuredClone(state); mutate(changed); assert.equal(canRetryStudioInspection(changed, 'request', STUDIO_ARCHIVED_WEBP_REPAIR), false); }
});

test('approved archive is queried by supplier provenance AND checksum, never fetched over the network', async () => {
  const content = await sharp({ create: { width: 5, height: 7, channels: 3, background: 'black' } }).png().toBuffer();
  const asset = { sourceUrl: 'https://ae01.alicdn.com/original.webp', url: 'https://ddf.example/api/media?id=archived', checksum: checksum(content) };
  let queries = 0;
  const reference = await archivedStudioReference(asset, { query: async (sql, args) => {
    queries++; assert.match(sql, /supplier_media_archive/); assert.match(sql, /b.checksum_sha256=\$2/);
    assert.deepEqual(args, [asset.sourceUrl, asset.checksum]);
    return { rows: [{ content, checksum_sha256: asset.checksum }] };
  } });
  assert.equal(queries, 1); assert.match(reference, /^data:image\/png;/);
  await assert.rejects(normalizedStudioRaster(content, '0'.repeat(64)), error => error.code === 'studio_source_integrity_failed');
  await assert.rejects(archivedStudioReference(asset, { query: async () => ({ rows: [] }) }), error => error.code === 'studio_source_integrity_failed');
  const invalid = Buffer.from('not an image');
  await assert.rejects(normalizedStudioRaster(invalid, checksum(invalid)), error => error.code === 'studio_source_conversion_failed');
});
