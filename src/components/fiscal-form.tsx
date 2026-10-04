'use client';

import { useState } from 'react';
import { command, errorMessage, sendCommand } from '@/lib/command-client';
import type { MasterProduct } from '@/lib/product-factory';
import { availabilityLabels, emptyFiscal, fiscalGaps, fiscalOrigins, fiscalUnits, type Availability } from '@/lib/product-fiscal';

const num = (value: FormDataEntryValue | null) => { const text = String(value ?? '').trim(); return text === '' ? null : Number(text.replace(',', '.')); };

// Stock model + first fiscal layer. Everything is optional: saving with blanks never blocks the product;
// what is missing shows up as a checklist instead.
export function FiscalPanel({ product }: { product: MasterProduct }) {
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const fiscal = product.fiscal ?? emptyFiscal;
  const variants = product.spec?.variants ?? [];
  const gaps = fiscalGaps(product);
  async function run(type: string, input: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await sendCommand(command(type, input)); setMessage(success); } catch (cause) { setError(errorMessage(cause, 'Não foi possível salvar.')); } finally { setBusy(false); }
  }
  return <section className="space-y-4" aria-label="Estoque e cadastro fiscal">
    <div>
      <h3 className="text-lg font-semibold">Disponibilidade</h3>
      <p className="text-sm text-[var(--muted)]">Pronta entrega = estoque físico em São Paulo (Bling). Sob encomenda = estoque do fornecedor (dropshipping).</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Disponibilidade">
        {(Object.keys(availabilityLabels) as Availability[]).map(value => <button key={value} type="button" disabled={busy} aria-pressed={product.availability === value} className={`ddf-button ${product.availability === value ? 'accent' : 'secondary'}`} onClick={() => run('products.setAvailability', { productId: product.id, availability: value }, `Marcado como ${availabilityLabels[value]}.`)}>{availabilityLabels[value]}</button>)}
      </div>
    </div>
    <form key={product.version} className="space-y-4" onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const fiscalInput = Object.fromEntries(['ncm', 'cest', 'origin', 'unit', 'brand', 'model', 'warranty'].map(key => [key, String(form.get(key) ?? '')]));
      const variantInput = variants.map(variant => ({ id: variant.id, gtin: String(form.get(`gtin:${variant.id}`) ?? ''), weightGrams: num(form.get(`weight:${variant.id}`)), dimensions: { lengthCm: num(form.get(`length:${variant.id}`)), widthCm: num(form.get(`width:${variant.id}`)), heightCm: num(form.get(`height:${variant.id}`)) } }));
      void run('products.updateFiscal', { productId: product.id, fiscal: fiscalInput, variants: variantInput }, 'Dados fiscais salvos em uma nova versão.');
    }}>
      <h3 className="text-lg font-semibold">Cadastro fiscal e logístico <span className="text-sm font-normal text-[var(--muted)]">(todos opcionais)</span></h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">NCM<input name="ncm" className="ddf-input" inputMode="numeric" placeholder="0000.00.00" defaultValue={fiscal.ncm} /></label>
        <label className="text-sm">CEST<input name="cest" className="ddf-input" inputMode="numeric" placeholder="00.000.00" defaultValue={fiscal.cest} /></label>
        <label className="text-sm">Origem<select name="origin" className="ddf-input" defaultValue={fiscal.origin}><option value="">Não informada</option>{Object.entries(fiscalOrigins).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label className="text-sm">Unidade<select name="unit" className="ddf-input" defaultValue={fiscal.unit}><option value="">Não informada</option>{fiscalUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
        <label className="text-sm">Marca<input name="brand" className="ddf-input" defaultValue={fiscal.brand} /></label>
        <label className="text-sm">Modelo<input name="model" className="ddf-input" defaultValue={fiscal.model} /></label>
        <label className="text-sm sm:col-span-2">Garantia<input name="warranty" className="ddf-input" placeholder="Ex.: 90 dias contra defeito de fabricação" defaultValue={fiscal.warranty} /></label>
      </div>
      <fieldset>
        <legend className="font-semibold">Por variação: GTIN, peso e dimensões</legend>
        {variants.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">Nenhuma variação cadastrada. Crie as variações no cadastro mestre (Product Factory).</p> : <div className="mt-2 space-y-3">
          {variants.map(variant => <div key={variant.id} className="rounded-lg border border-[var(--line)] p-3">
            <p className="text-sm font-semibold">{variant.title || variant.sku} <span className="font-normal text-[var(--muted)]">· SKU {variant.sku}</span></p>
            <div className="mt-1 grid grid-cols-2 gap-x-3 sm:grid-cols-5">
              <label className="col-span-2 text-xs sm:col-span-1">GTIN/EAN<input name={`gtin:${variant.id}`} className="ddf-input" inputMode="numeric" defaultValue={variant.gtin} /></label>
              <label className="text-xs">Peso (g)<input name={`weight:${variant.id}`} className="ddf-input" inputMode="decimal" defaultValue={variant.weightGrams ?? ''} /></label>
              <label className="text-xs">Compr. (cm)<input name={`length:${variant.id}`} className="ddf-input" inputMode="decimal" defaultValue={variant.dimensions?.lengthCm ?? ''} /></label>
              <label className="text-xs">Largura (cm)<input name={`width:${variant.id}`} className="ddf-input" inputMode="decimal" defaultValue={variant.dimensions?.widthCm ?? ''} /></label>
              <label className="text-xs">Altura (cm)<input name={`height:${variant.id}`} className="ddf-input" inputMode="decimal" defaultValue={variant.dimensions?.heightCm ?? ''} /></label>
            </div>
          </div>)}
        </div>}
      </fieldset>
      <button className="ddf-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados fiscais'}</button>
    </form>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="text-sm text-green-800">{message}</p>}
    <div><h3 className="font-semibold">Ainda falta para marketplaces e ERP</h3>{gaps.length ? <ul className="mt-1 list-disc pl-5 text-sm text-[var(--warning)]">{gaps.map(gap => <li key={gap}>{gap}</li>)}</ul> : <p className="mt-1 text-sm text-green-800">Cadastro fiscal completo nesta camada.</p>}</div>
  </section>;
}
