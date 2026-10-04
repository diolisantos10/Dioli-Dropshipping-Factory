// First fiscal/logistics layer of the master product. Every field is optional so product entry
// never blocks; when a value IS given it must be well-formed, and what is still missing is reported
// as a non-blocking gap list (what marketplaces and the ERP will ask for later).
import type { MasterProduct, ProductVariant } from './product-factory.ts';

export type Availability = 'PRONTA_ENTREGA' | 'SOB_ENCOMENDA';
export const availabilityLabels: Record<Availability, string> = { PRONTA_ENTREGA: 'Pronta entrega', SOB_ENCOMENDA: 'Sob encomenda' };
// Fiscal origin codes (0–8) used on the Brazilian NF-e.
export const fiscalOrigins: Record<string, string> = {
  '0': '0 · Nacional',
  '1': '1 · Estrangeira, importação direta',
  '2': '2 · Estrangeira, adquirida no mercado interno',
  '3': '3 · Nacional, conteúdo de importação > 40% e ≤ 70%',
  '4': '4 · Nacional, processos produtivos básicos',
  '5': '5 · Nacional, conteúdo de importação ≤ 40%',
  '6': '6 · Estrangeira, importação direta, sem similar nacional (CAMEX)',
  '7': '7 · Estrangeira, mercado interno, sem similar nacional (CAMEX)',
  '8': '8 · Nacional, conteúdo de importação > 70%',
};
export const fiscalUnits = ['UN', 'PC', 'PAR', 'KIT', 'CX', 'JG', 'CJ', 'KG', 'M', 'L'] as const;

export type ProductFiscal = { ncm: string; cest: string; origin: string; unit: string; brand: string; model: string; warranty: string };
export const emptyFiscal: ProductFiscal = { ncm: '', cest: '', origin: '', unit: '', brand: '', model: '', warranty: '' };
export type VariantLogistics = { id: string; gtin: string; weightGrams: number | null; dimensions: ProductVariant['dimensions'] };

const digits = (value: string) => value.replace(/[\s.\-/]/g, '');
// GS1 check digit for GTIN-8/12/13/14.
export function isValidGtin(value: string) {
  const code = digits(value);
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const body = code.slice(0, -1).split('').reverse().map(Number);
  const sum = body.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code.at(-1));
}

export function normalizeFiscal(input: Partial<ProductFiscal>): ProductFiscal {
  const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
  const fiscal: ProductFiscal = {
    ncm: digits(text(input.ncm, 20)), cest: digits(text(input.cest, 20)), origin: text(input.origin, 1), unit: text(input.unit, 6).toUpperCase(),
    brand: text(input.brand, 120), model: text(input.model, 120), warranty: text(input.warranty, 200),
  };
  if (fiscal.ncm && !/^\d{8}$/.test(fiscal.ncm)) throw new Error('NCM deve ter 8 dígitos (ex.: 4202.92.00).');
  if (fiscal.cest && !/^\d{7}$/.test(fiscal.cest)) throw new Error('CEST deve ter 7 dígitos (ex.: 28.059.00).');
  if (fiscal.origin && !Object.hasOwn(fiscalOrigins, fiscal.origin)) throw new Error('Origem fiscal deve ser um código de 0 a 8.');
  if (fiscal.unit && !(fiscalUnits as readonly string[]).includes(fiscal.unit)) throw new Error(`Unidade deve ser uma de: ${fiscalUnits.join(', ')}.`);
  return fiscal;
}

const measure = (value: unknown, label: string) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) throw new Error(`${label} deve ser um número positivo.`);
  return parsed;
};
export function normalizeVariantLogistics(input: Partial<VariantLogistics> & { id?: string }): VariantLogistics {
  const id = String(input.id ?? '').trim();
  if (!id) throw new Error('Variação sem identificador.');
  const gtin = digits(String(input.gtin ?? '').trim());
  if (gtin && !isValidGtin(gtin)) throw new Error(`GTIN inválido na variação ${id}: confira os dígitos (8, 12, 13 ou 14 com dígito verificador).`);
  const dimensions = input.dimensions ?? { lengthCm: null, widthCm: null, heightCm: null };
  return {
    id, gtin, weightGrams: measure(input.weightGrams, 'Peso'),
    dimensions: { lengthCm: measure(dimensions.lengthCm, 'Comprimento'), widthCm: measure(dimensions.widthCm, 'Largura'), heightCm: measure(dimensions.heightCm, 'Altura') },
  };
}

// Non-blocking checklist: what is still missing for marketplaces/ERP.
export function fiscalGaps(product: Pick<MasterProduct, 'spec'> & { fiscal?: ProductFiscal; availability?: Availability }) {
  const fiscal = product.fiscal ?? emptyFiscal;
  const gaps: string[] = [];
  if (!product.availability) gaps.push('Disponibilidade (pronta entrega / sob encomenda)');
  if (!fiscal.ncm) gaps.push('NCM');
  if (!fiscal.origin) gaps.push('Origem fiscal');
  if (!fiscal.unit) gaps.push('Unidade');
  if (!fiscal.brand) gaps.push('Marca');
  const variants = product.spec?.variants ?? [];
  if (!variants.length) gaps.push('Ao menos uma variação');
  for (const variant of variants) {
    const name = variant.title || variant.sku || variant.id;
    if (!variant.gtin) gaps.push(`GTIN · ${name}`);
    if (variant.weightGrams === null || variant.weightGrams === undefined) gaps.push(`Peso · ${name}`);
    const { lengthCm, widthCm, heightCm } = variant.dimensions ?? { lengthCm: null, widthCm: null, heightCm: null };
    if ([lengthCm, widthCm, heightCm].some(value => value === null || value === undefined)) gaps.push(`Dimensões · ${name}`);
  }
  return gaps;
}
export function fiscalCompletion(product: Parameters<typeof fiscalGaps>[0]) {
  const variants = Math.max(1, product.spec?.variants?.length ?? 0);
  const total = 5 + variants * 3;
  return Math.round(((total - Math.min(total, fiscalGaps(product).length)) / total) * 100);
}
