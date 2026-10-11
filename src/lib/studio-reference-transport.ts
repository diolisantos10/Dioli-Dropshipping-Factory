import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { GatewayError } from './ai-gateway.ts';

const MAX_BYTES = 10_000_000;
type Original = { url: string; sourceUrl?: string; checksum?: string; mimeType?: string };
type ArchiveDatabase = { query: (sql: string, values: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/** xAI vision accepts PNG/JPEG. Decode archived WebP/AVIF without changing geometry or archive bytes. */
export async function normalizedStudioRaster(content: Buffer, expectedChecksum: string) {
  if (!content.length || content.length > MAX_BYTES || createHash('sha256').update(content).digest('hex') !== expectedChecksum) {
    throw new GatewayError('studio_source_integrity_failed', 'Original arquivado ausente ou com integridade divergente.');
  }
  try {
    const image = sharp(content, { limitInputPixels: 40_000_000 });
    const before = await image.metadata();
    if (!before.width || !before.height || (before.pages ?? 1) !== 1) throw new Error('Invalid raster');
    // No resize, crop, rotate, sharpen or lossy recompression.
    const converted = await image.png().toBuffer({ resolveWithObject: true });
    if (converted.info.width !== before.width || converted.info.height !== before.height || converted.data.length > MAX_BYTES) throw new Error('Invalid conversion');
    return `data:image/png;base64,${converted.data.toString('base64')}`;
  } catch {
    throw new GatewayError('studio_source_conversion_failed', 'Original não pôde ser convertido sem alterar suas dimensões.');
  }
}

export async function archivedStudioReference(asset: Original, db: ArchiveDatabase) {
  // Preserve existing remote transport for originals not yet archived.
  if (!asset.sourceUrl) return asset.url;
  if (!asset.checksum || !/^[a-f0-9]{64}$/i.test(asset.checksum)) throw new GatewayError('studio_source_integrity_failed', 'Original arquivado sem integridade verificável.');
  const row = (await db.query('SELECT b.content,b.checksum_sha256 FROM supplier_media_archive a JOIN media_blobs b ON b.id=a.blob_id WHERE a.source_url=$1 AND b.checksum_sha256=$2', [asset.sourceUrl, asset.checksum])).rows[0];
  if (!row || !Buffer.isBuffer(row.content) || row.checksum_sha256 !== asset.checksum) throw new GatewayError('studio_source_integrity_failed', 'Original arquivado não corresponde à referência aprovada.');
  return normalizedStudioRaster(row.content, asset.checksum);
}
