import { createHash, randomUUID } from 'node:crypto';
import { getDatabasePool, readState } from './server-state';
import { runServerCommand } from './command-runner';
import { emptyMedia, type MediaState } from './media-factory';

const MAX_BYTES = 10_000_000;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
export function archiveHostClass(value: string) {
  try { const host = new URL(value).hostname; return /(^|\.)alicdn\.com$/.test(host) ? 'alicdn' : /(^|\.)aliexpress-media\.com$/.test(host) ? 'aliexpress_media' : 'other'; } catch { return 'other'; }
}
class ArchiveFailure extends Error { constructor(public code: string) { super(code); } }
export function archiveFailureCode(error: unknown, phase: 'download' | 'persistence') {
  if (error instanceof ArchiveFailure) return error.code;
  const databaseCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (phase === 'persistence' && databaseCode === '42P01') return 'persistence_schema_missing';
  if (phase === 'persistence' && databaseCode === '42501') return 'persistence_permission';
  return error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : phase === 'persistence' ? 'persistence' : 'download_failed';
}
export function archiveSourceAllowed(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && /(^|\.)(alicdn\.com|aliexpress-media\.com)$/.test(url.hostname);
  } catch { return false; }
}

// Originals are copied into the existing database blob store; supplier URLs remain provenance.
export async function persistSupplierOriginals(productId: string, correlationId: string) {
  const media = ((await readState('media'))?.payload ?? emptyMedia) as MediaState;
  const pending = media.assets.filter(asset => asset.productId === productId && asset.kind === 'ORIGINAL' && !asset.sourceUrl);
  const db = await getDatabasePool();
  const failures: string[] = [];
  const failureCodes: Record<string, number> = {};
  const failureHosts: Record<string, number> = {};
  let archived = 0;
  const finish = () => {
    const result = { archived, remaining: pending.length - archived, failures, failureCodes, failureHosts };
    console.info('DDF_SUPPLIER_ARCHIVE', JSON.stringify({ archived, remaining: result.remaining, failureCount: failures.length, failureCodes, failureHosts }));
    return result;
  };
  const deadline = Date.now() + 60_000;
  if (!process.env.DDF_PUBLIC_URL) { if (pending.length) { failures.push('URL pública da DDF ausente para arquivar originais.'); failureCodes.public_url_missing = pending.length; } return finish(); }
  for (const asset of pending.slice(0, 40)) {
    if (Date.now() >= deadline) break;
    let phase: 'download' | 'persistence' = 'persistence';
    try {
      if (!archiveSourceAllowed(asset.url)) throw new ArchiveFailure('origin_not_allowed');
      let row = (await db.query(`SELECT b.* FROM supplier_media_archive a JOIN media_blobs b ON b.id=a.blob_id WHERE a.source_url=$1`, [asset.url])).rows[0];
      if (!row) {
        phase = 'download';
        // Observe and reject redirect status; never follow it to a different host or protocol.
        const response = await fetch(asset.url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
        const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!response.ok) throw new ArchiveFailure(`http_${response.status}`);
        if (!TYPES.has(mimeType)) throw new ArchiveFailure('invalid_mime');
        if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new ArchiveFailure('oversize');
        if (!response.body) throw new ArchiveFailure('empty_image');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let bytes = 0;
        for (;;) {
          const result = await reader.read(); if (result.done) break;
          bytes += result.value.length;
          if (bytes > MAX_BYTES) { await reader.cancel(); throw new ArchiveFailure('oversize'); }
          chunks.push(result.value);
        }
        if (!bytes) throw new ArchiveFailure('empty_image');
        const content = Buffer.concat(chunks); const checksum = createHash('sha256').update(content).digest('hex'); const id = randomUUID();
        phase = 'persistence';
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          await client.query(`INSERT INTO media_blobs(id,filename,mime_type,bytes,checksum_sha256,content) VALUES($1,$2,$3,$4,$5,$6)`, [id, `supplier-${id}`, mimeType, bytes, checksum, content]);
          await client.query(`INSERT INTO supplier_media_archive(source_url,blob_id) VALUES($1,$2) ON CONFLICT(source_url) DO NOTHING`, [asset.url, id]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
        row = (await db.query(`SELECT b.* FROM supplier_media_archive a JOIN media_blobs b ON b.id=a.blob_id WHERE a.source_url=$1`, [asset.url])).rows[0];
      }
      await runServerCommand('media.persistOriginal', { assetId: asset.id, url: `${new URL(process.env.DDF_PUBLIC_URL).origin}/api/media?id=${row.id}`, checksum: row.checksum_sha256, mimeType: row.mime_type, bytes: Number(row.bytes) }, { role: 'SYSTEM', actor: 'system:media-archive', correlationId });
      archived++;
    } catch (error) {
      const code = archiveFailureCode(error, phase), host = archiveHostClass(asset.url);
      failureCodes[code] = (failureCodes[code] ?? 0) + 1;
      failureHosts[host] = (failureHosts[host] ?? 0) + 1;
      failures.push('Não foi possível arquivar uma foto; a referência original foi preservada.');
    }
  }
  return finish();
}
