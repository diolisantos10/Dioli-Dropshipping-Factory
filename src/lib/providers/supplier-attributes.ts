import type { SupplierDetails } from '../intake.ts';

/** Component sizes are specifications, never overall product dimensions. */
export function supplierTechnicalAttributes(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const patterns: [string, RegExp][] = [
    ['Largura da lente', /(?:lens\s+width|largura\s+(?:da\s+)?lente)\s*[:=|]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/gi],
    ['Altura da lente', /(?:lens\s+height|altura\s+(?:da\s+)?lente)\s*[:=|]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/gi],
    ['Comprimento da haste', /(?:temple\s+length|comprimento\s+(?:da\s+)?haste)\s*[:=|]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/gi],
    ['Largura da ponte', /(?:bridge(?:\s+width)?|largura\s+(?:da\s+)?ponte|ponte)\s*[:=|]?\s*(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/gi],
  ];
  for (const [key, pattern] of patterns) {
    const values = [...new Set([...text.matchAll(pattern)].map(match => `${match[1]} ${match[2].toLowerCase()}`))];
    if (values.length === 1) fields[key] = values[0];
  }
  const labels: [string, string][] = [
    ['Modelo', 'número do modelo|model number|model'],
    ['Material da armação', 'material da armação|frame material|frame'],
    ['Material das lentes', 'material das lentes|lens material|lens'],
    ['Polarização', 'tipo de polarização|polarization|polarização'],
    ['Categoria de filtro', 'categoria de filtro|filter category'],
    ['Proteção UV declarada pelo fornecedor', 'tipo profissional|uv protection'],
    ['Estojo incluído', 'caixas incluídas|case included'],
  ];
  for (const [key, labelsPattern] of labels) {
    const pattern = new RegExp(`(?:^|\\n)(?:${labelsPattern})\\s*(?:[:=|]\\s*|\\n\\s*)([^\\n|]{1,150})`, 'gi');
    const values = [...new Set([...text.matchAll(pattern)].map(match => match[1].trim()).filter(Boolean))];
    if (values.length === 1) fields[key] = values[0];
  }
  return fields;
}

/** Keep conflicting assertions as evidence; do not silently replace source or human data. */
export function resolveVisualAttributes(supplier: SupplierDetails) {
  const specifications = { ...supplier.specifications };
  const groups = new Map<string, Set<string>>();
  for (const item of supplier.visualAttributes ?? []) {
    if (item.sku) continue;
    const values = groups.get(item.key) ?? new Set<string>(); values.add(item.value); groups.set(item.key, values);
  }
  for (const [key, values] of groups) {
    if (values.size === 1 && !specifications[key]) specifications[key] = [...values][0];
    // A later batch can contradict an attribute selected by an earlier batch.
    // Remove that selection; keep every assertion and quote in visualAttributes.
    else if (values.size > 1 && values.has(specifications[key])) delete specifications[key];
  }
  return specifications;
}
