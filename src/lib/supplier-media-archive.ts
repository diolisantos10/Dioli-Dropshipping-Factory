import { createHash, randomUUID } from 'node:crypto';
import { getDatabasePool, readState } from './server-state';
import { runServerCommand } from './command-runner';
import { emptyMedia, type MediaState } from './media-factory';

const MAX_BYTES = 10_000_000;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
export function archiveSourceAllowed(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && /(^|\.)alicdn\.com$/.test(url.hostname);
  } catch { return false; }
}

// Originals are copied into the existing database blob store; supplier URLs remain provenance.
export async function persistSupplierOriginals(productId: string, correlationId: string) {
  const media = ((await readState('media'))?.payload ?? emptyMedia) as MediaState;
  const pending = media.assets.filter(asset => asset.productId === productId && asset.kind === 'ORIGINAL' && !asset.sourceUrl);
  const db = await getDatabasePool();
  const failures: string[] = [];
  let archived = 0;
  const deadline = Date.now() + 60_000;
  if (!process.env.DDF_PUBLIC_URL) return { archived, remaining: pending.length, failures: pending.length ? ['URL pública da DDF ausente para arquivar originais.'] : [] };
  for (const asset of pending.slice(0, 40)) {
    if (Date.now() >= deadline) break;
    try {
      if (!archiveSourceAllowed(asset.url)) throw new Error('Origem não autorizada.');
      let row = (await db.query(`SELECT b.* FROM supplier_media_archive a JOIN media_blobs b ON b.id=a.blob_id WHERE a.source_url=$1`, [asset.url])).rows[0];
      if (!row) {
        const response = await fetch(asset.url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
        const mimeType = (response.headers.get('content-type') ?? '').split(';')[0];
        if (!response.ok || !TYPES.has(mimeType) || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw new Error('Foto indisponível.');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let bytes = 0;
        for (;;) {
          const result = await reader.read(); if (result.done) break;
          bytes += result.value.length;
          if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('Foto acima do limite.'); }
          chunks.push(result.value);
        }
        if (!bytes) throw new Error('Foto vazia.');
        const content = Buffer.concat(chunks); const checksum = createHash('sha256').update(content).digest('hex'); const id = randomUUID();
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
    } catch { failures.push(`Não foi possível arquivar ${asset.purpose}; a referência original foi preservada.`); }
  }
  return { archived, remaining: pending.length - archived, failures };
}
