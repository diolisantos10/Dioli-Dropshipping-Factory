import type { Candidate, CandidateSupplier } from '../intake.ts';
import { parseLegacyNotes } from '../storefront.ts';

/** Reuse recorded sources only; legacy notes are not a fresh supplier import. */
export function supplierForImageReading(candidate: Candidate): CandidateSupplier | null {
  const legacy = parseLegacyNotes(candidate.notes ?? '');
  const stored = candidate.supplier;
  if (!stored) {
    let url: URL;
    try { url = new URL(candidate.url); } catch { return null; }
    if (!/(^|\.)aliexpress\.com$/.test(url.hostname) || !legacy.imageUrl) return null;
  }
  const images = [...new Set([...(stored?.images ?? []), stored?.imageUrl, ...(stored?.variants ?? []).map(variant => variant.imageUrl), legacy.imageUrl].filter((url): url is string => Boolean(url)))];
  if (!images.length) return null;
  return { name: legacy.supplier || 'AliExpress', ref: legacy.ref || candidate.url.match(/\/item\/(\d+)\.html/)?.[1] || '',
    cost: legacy.cost, currency: legacy.currency || 'BRL', stock: legacy.stock, variants: [], ...stored,
    imageUrl: stored?.imageUrl || images[0], images };
}
