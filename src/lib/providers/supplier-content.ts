import type { SupplierFact } from '../intake.ts';

export const SUPPLIER_IMPORT_REVISION = 2;

export function decodeSupplierText(value: string): string {
  const entities: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", times: '×' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (original, code: string) => {
    if (!code.startsWith('#')) return entities[code.toLowerCase()] ?? original;
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : original;
  });
}

function withoutExecutableMarkup(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
}

export function supplierPlainText(html: string): string {
  return decodeSupplierText(withoutExecutableMarkup(html).replace(/<(?:br\b[^>]*|\/(?:p|div|li|tr|h[1-6])\s*)>/gi, '\n')
    .replace(/<\/(?:td|th)\s*>/gi, ' | ').replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function imageUrl(value: string): string {
  try {
    const decoded = decodeSupplierText(value).trim();
    const url = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.protocol = 'https:';
    return url.href;
  } catch { return ''; }
}

export function supplierDescriptionContent(html: string) {
  const safe = withoutExecutableMarkup(html);
  const images: string[] = [];
  const imageLabels: string[] = [];
  for (const tag of safe.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    for (const attr of tag[0].matchAll(/\s(src|data-src|data-original|data-lazy-src|data-image|srcset|data-srcset|alt|title)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const name = attr[1].toLowerCase();
      const value = attr[2] ?? attr[3] ?? attr[4] ?? '';
      if (name === 'alt' || name === 'title') { const label = decodeSupplierText(value).trim(); if (label) imageLabels.push(label); }
      else if (name.includes('srcset')) images.push(...value.split(',').map(item => imageUrl(item.trim().split(/\s+/)[0])).filter(Boolean));
      else { const url = imageUrl(value); if (url) images.push(url); }
    }
  }
  const specifications: Record<string, string> = {};
  for (const row of safe.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi)].map(match => supplierPlainText(match[1]));
    if (cells.length === 2 && cells.every(Boolean)) specifications[cells[0]] = cells[1];
  }
  return { description: supplierPlainText(html), images: [...new Set(images)], imageLabels: [...new Set(imageLabels)], specifications };
}

/** Only labelled measurements with an explicit unit become technical fields. */
export function supplierMeasurements(text: string, source: SupplierFact['source'], sku?: string) {
  const facts: SupplierFact[] = [];
  const names: Record<string, string> = { comprimento: 'lengthCm', length: 'lengthCm', largura: 'widthCm', width: 'widthCm', altura: 'heightCm', height: 'heightCm' };
  const pattern = /\b(comprimento|length|largura|width|altura|height|peso\s+l[ií]quido|net\s+weight|product\s+weight|peso\s+do\s+produto)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|metros?|m|inches|inch|in|polegadas?|kg|grams?|gramas?|g)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const label = match[1].toLowerCase();
    const value = Number(match[2].replace(',', '.'));
    const unit = match[3].toLowerCase();
    const weight = /peso|weight/.test(label);
    const factor = weight ? (unit === 'kg' ? 1000 : /^(g|grams?|gramas?)$/.test(unit) ? 1 : null)
      : unit === 'mm' ? 0.1 : unit === 'cm' ? 1 : /^(m|metros?)$/.test(unit) ? 100 : /^(in|inch|inches|polegadas?)$/.test(unit) ? 2.54 : null;
    // Packaging and component measurements stay in the original specifications, never overall product fields.
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    const prefix = text.slice(lineStart, match.index).slice(-120);
    if (factor === null || value <= 0 || /package|packaging|embalagem|shipping|gross|bruto|\blens(?:es)?\b|\blente(?:s)?\b|\btemple(?:s)?\b|\bhaste(?:s)?\b|\bbridge\b|\bponte\b/i.test(prefix)) continue;
    facts.push({ field: weight ? 'weightGrams' : names[label], value: Number((value * factor).toFixed(6)), unit: weight ? 'g' : 'cm',
      source, ...(sku ? { sku } : {}), excerpt: match[0] });
  }
  const dimensions: { lengthCm?: number; widthCm?: number; heightCm?: number } = {};
  for (const field of ['lengthCm', 'widthCm', 'heightCm'] as const) {
    const values = [...new Set(facts.filter(fact => fact.field === field).map(fact => fact.value))];
    if (values.length === 1) dimensions[field] = values[0];
  }
  const weights = [...new Set(facts.filter(fact => fact.field === 'weightGrams').map(fact => fact.value))];
  return { facts, dimensions: Object.keys(dimensions).length ? dimensions : undefined, weightGrams: weights.length === 1 ? weights[0] : undefined };
}
