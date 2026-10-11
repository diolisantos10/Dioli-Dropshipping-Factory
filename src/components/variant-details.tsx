/* eslint-disable @next/next/no-img-element -- original supplier images are preserved. */
import type { CardVariant } from '@/lib/storefront';

export function VariantDetails({ variants, currency, fromSource = false }: { variants: CardVariant[]; currency?: string; fromSource?: boolean }) {
  const measure = (value: number | null | undefined, unit: string) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? `${value.toLocaleString('pt-BR')} ${unit}` : 'Ainda não confirmado';
  return <section className="space-y-3" aria-label="Ficha das variantes">
    <h3 className="font-semibold">{fromSource ? 'Variantes registradas na origem' : 'Variantes'} ({variants.length})</h3>
    {fromSource && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Estas variantes estão preservadas na origem do fornecedor e ainda não constam na versão salva da ficha. A exibição não confirma a revisão do cadastro final.</p>}
    {!variants.length ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Variantes ainda não registradas nesta ficha. Isso não confirma que o produto tenha uma única opção. A origem precisa ser complementada.</p> : <ul className="space-y-3">
      {variants.map(variant => <li key={variant.id} className="space-y-3 rounded-lg border border-[var(--line)] p-3 text-sm">
        <div className="flex items-start gap-3">{variant.imageUrl && <img src={variant.imageUrl} alt={variant.label} loading="lazy" referrerPolicy="no-referrer" className="h-16 w-16 flex-none rounded object-contain" />}<div className="min-w-0"><h4 className="break-words font-semibold">{variant.label}</h4><p className="break-all text-[var(--muted)]">SKU: {variant.sku || variant.id}</p>{variant.gtin && <p>GTIN/EAN: {variant.gtin}</p>}</div></div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {Object.entries(variant.attributes ?? {}).map(([key, value]) => <div key={key}><dt className="font-medium">{key}</dt><dd className="whitespace-pre-wrap break-words">{value || 'Ainda não confirmado'}</dd></div>)}
          {!variant.attributes && variant.detail && <div className="sm:col-span-2"><dt className="font-medium">Atributos registrados</dt><dd className="whitespace-pre-wrap break-words">{variant.detail}</dd></div>}
          <div><dt className="font-medium">Peso do produto</dt><dd>{measure(variant.weightGrams, 'g')}</dd></div>
          <div><dt className="font-medium">Dimensões do produto (C × L × A)</dt><dd>{Object.values(variant.dimensions ?? {}).some(value => typeof value === 'number' && value > 0) ? [variant.dimensions?.lengthCm, variant.dimensions?.widthCm, variant.dimensions?.heightCm].map(value => measure(value, 'cm')).join(' × ') : 'Ainda não confirmado'}</dd></div>
          {variant.price !== null && <div><dt className="font-medium">Custo informado</dt><dd>{currency} {variant.price.toLocaleString('pt-BR')}</dd></div>}
          {variant.stock !== null && <div><dt className="font-medium">Estoque informado</dt><dd>{variant.stock.toLocaleString('pt-BR')}</dd></div>}
        </dl>
      </li>)}
    </ul>}
  </section>;
}
