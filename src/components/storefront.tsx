'use client';
/* eslint-disable @next/next/no-img-element -- supplier and media URLs come from many unknown hosts; next/image would need each one allow-listed. */

import { useEffect, useMemo, useState } from 'react';
import { filterCards, NO_AVAILABILITY, suppliersOf, type StoreCard, type StoreFilters } from '@/lib/storefront';
import { availabilityLabels } from '@/lib/product-fiscal';

export type BulkAction = { status: string; label: string; tone?: 'primary' | 'secondary' | 'danger' };
export type StateOption = { value: string; label: string };

const PAGE = 48;
export function formatMoney(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(value)) return '—';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}
const stateTone: Record<string, string> = {
  APROVADO: 'bg-[var(--success-soft)] text-[var(--success)]', PRONTO: 'bg-[var(--success-soft)] text-[var(--success)]',
  REJEITADO: 'bg-[var(--danger-soft)] text-[var(--danger)]', ARQUIVADO: 'bg-stone-200 text-stone-700',
  INFORMACAO_SOLICITADA: 'bg-[var(--warning-soft)] text-[var(--warning)]', TRIADO: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
};

export function Storefront({ cards, stateOptions, defaultState = '', bulkActions, onBulk, renderDetail, emptyText, loading, showAvailability = false }: {
  cards: StoreCard[];
  stateOptions: StateOption[];
  defaultState?: string;
  bulkActions: BulkAction[];
  onBulk: (ids: string[], status: string, reason: string) => Promise<string>;
  renderDetail?: (card: StoreCard, close: () => void) => React.ReactNode;
  emptyText: string;
  loading?: boolean;
  // Master products carry a stock model (pronta entrega / sob encomenda); candidates do not.
  showAvailability?: boolean;
}) {
  const [filters, setFilters] = useState<StoreFilters>({ query: '', minCost: '', maxCost: '', supplier: '', state: defaultState, availability: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [reason, setReason] = useState('Decisão em massa pela vitrine');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const suppliers = useMemo(() => suppliersOf(cards), [cards]);
  const visible = useMemo(() => filterCards(cards, filters), [cards, filters]);
  const shown = visible.slice(0, limit);
  const open = openId ? cards.find(card => card.id === openId) ?? null : null;
  const selectedVisible = visible.filter(card => selected.has(card.id));
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length;

  const update = (patch: Partial<StoreFilters>) => { setFilters(current => ({ ...current, ...patch })); setLimit(PAGE); };
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map(card => card.id)));

  async function confirm() {
    if (!pending || !selectedVisible.length) return;
    setBusy(true); setFeedback(null);
    try {
      const text = await onBulk(selectedVisible.map(card => card.id), pending.status, reason);
      setFeedback({ kind: 'ok', text }); setSelected(new Set()); setPending(null);
    } catch (cause) { setFeedback({ kind: 'error', text: cause instanceof Error ? cause.message : 'Não foi possível concluir.' }); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <section className={`surface grid grid-cols-2 gap-x-3 gap-y-2 p-3 sm:p-4 ${showAvailability ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`} aria-label="Filtros da vitrine">
      <label className="col-span-2 text-sm">Buscar<input className="ddf-input" type="search" value={filters.query} onChange={event => update({ query: event.target.value })} placeholder="Nome, fornecedor, referência, SKU" /></label>
      <label className="text-sm">Custo mínimo<input className="ddf-input" inputMode="decimal" value={filters.minCost} onChange={event => update({ minCost: event.target.value })} placeholder="0,00" /></label>
      <label className="text-sm">Custo máximo<input className="ddf-input" inputMode="decimal" value={filters.maxCost} onChange={event => update({ maxCost: event.target.value })} placeholder="999,00" /></label>
      <label className="text-sm">Fornecedor<select className="ddf-input" value={filters.supplier} onChange={event => update({ supplier: event.target.value })}><option value="">Todos</option>{suppliers.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="text-sm">Estado<select className="ddf-input" value={filters.state} onChange={event => update({ state: event.target.value })}>{stateOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {showAvailability && <label className="text-sm">Disponibilidade<select className="ddf-input" value={filters.availability} onChange={event => update({ availability: event.target.value })}><option value="">Todas</option><option value="PRONTA_ENTREGA">{availabilityLabels.PRONTA_ENTREGA}</option><option value="SOB_ENCOMENDA">{availabilityLabels.SOB_ENCOMENDA}</option><option value={NO_AVAILABILITY}>Sem definição</option></select></label>}
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-[var(--muted)]" aria-live="polite">{loading ? 'Carregando do servidor…' : `${visible.length} de ${cards.length} produto(s)`}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={allSelected} onChange={toggleAll} disabled={!visible.length} /> Selecionar todos ({visible.length})</label>
        {(filters.query || filters.minCost || filters.maxCost || filters.supplier || filters.availability || filters.state !== defaultState) && <button className="ddf-button secondary" onClick={() => { setFilters({ query: '', minCost: '', maxCost: '', supplier: '', state: defaultState, availability: '' }); setLimit(PAGE); }}>Limpar filtros</button>}
      </div>
    </div>

    {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-md border p-3 text-sm ${feedback.kind === 'error' ? 'border-red-300 bg-red-50 text-red-800' : 'border-green-300 bg-green-50 text-green-900'}`}>{feedback.text}</p>}

    {!loading && visible.length === 0 && <div className="surface p-8 text-center"><h2 className="text-lg font-semibold">Nenhum produto nesta vitrine</h2><p className="mt-2 text-[var(--muted)]">{emptyText}</p></div>}

    <ul className="grid grid-cols-2 gap-3 sm:gap-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" aria-label="Produtos">
      {shown.map(card => <li key={card.id} className={`surface group relative flex flex-col overflow-hidden transition-shadow hover:shadow-lg ${selected.has(card.id) ? 'ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--accent)]' : ''}`}>
        <label className="absolute left-2 top-2 z-10 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-white/90 shadow" title="Selecionar">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={selected.has(card.id)} onChange={() => toggle(card.id)} aria-label={`Selecionar ${card.title}`} />
        </label>
        <button type="button" className="flex flex-1 flex-col text-left" onClick={() => setOpenId(card.id)} aria-label={`Abrir detalhes de ${card.title}`}>
          <div className="relative aspect-[5/4] w-full overflow-hidden bg-stone-100">
            {card.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105" />
              : <div className="grid h-full w-full place-items-center text-xs text-[var(--muted)]">Sem foto</div>}
            <span className={`absolute bottom-2 left-2 max-w-[65%] truncate rounded-full px-2 py-1 text-[11px] font-semibold ${stateTone[card.state] ?? 'bg-white/90 text-stone-800'}`}>{card.stateLabel}</span>
            {showAvailability && card.availability && <span className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[11px] font-bold ${card.availability === 'PRONTA_ENTREGA' ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--ink)] text-[var(--brand-branco)]'}`}>{availabilityLabels[card.availability]}</span>}
            {card.images.length > 1 && <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{card.images.length} fotos</span>}
          </div>
          <div className="flex flex-1 flex-col gap-2 p-3">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-[15px]" title={card.fullTitle}>{card.title}</h3>
            <div className="mt-auto space-y-1 text-xs sm:text-sm">
              <p className="flex justify-between gap-2"><span className="text-[var(--muted)]">Custo</span><strong>{formatMoney(card.cost, card.currency)}</strong></p>
              <p className="flex justify-between gap-2"><span className="text-[var(--muted)]">Sugerido</span><strong className={card.suggestedPrice === null ? 'font-normal text-[var(--muted)]' : 'text-[var(--success)]'}>{card.suggestedPrice === null ? 'sem cálculo' : formatMoney(card.suggestedPrice, card.priceCurrency)}</strong></p>
              <p className="flex justify-between gap-2"><span className="text-[var(--muted)]">Estoque</span><span>{card.stock === null ? '—' : card.stock.toLocaleString('pt-BR')}</span></p>
              <p className="truncate text-[var(--muted)]" title={card.supplier}>{card.supplier}</p>
            </div>
          </div>
        </button>
      </li>)}
    </ul>
    {visible.length > shown.length && <div className="text-center"><button className="ddf-button secondary" onClick={() => setLimit(limit + PAGE)}>Mostrar mais ({visible.length - shown.length})</button></div>}

    {selectedVisible.length > 0 && <div className="sticky bottom-14 z-30 rounded-xl sm:bottom-3 border border-[var(--line)] bg-[var(--surface-strong)] p-3 shadow-2xl" role="region" aria-label="Ações em massa">
      {!pending ? <div className="flex flex-wrap items-center gap-2">
        <strong className="mr-auto text-sm">{selectedVisible.length} selecionado(s)</strong>
        {bulkActions.map(action => <button key={action.status} className={`ddf-button !px-3 sm:!px-[18px] ${action.tone === 'primary' ? 'accent' : 'secondary'} ${action.tone === 'danger' ? 'text-[var(--danger)]' : ''}`} onClick={() => setPending(action)}>{action.label}</button>)}
        <button className="ddf-button secondary" onClick={() => setSelected(new Set())}>Limpar</button>
      </div> : <form className="space-y-2" onSubmit={event => { event.preventDefault(); void confirm(); }}>
        <p className="text-sm"><strong>{pending.label}</strong> {selectedVisible.length} produto(s). Itens que não aceitam esta decisão são ignorados e informados.</p>
        <label className="block text-sm">Justificativa (fica na auditoria)<textarea className="ddf-input" rows={2} required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2"><button className="ddf-button" disabled={busy || !reason.trim()}>{busy ? 'Enviando…' : 'Confirmar'}</button><button type="button" className="ddf-button secondary" onClick={() => setPending(null)} disabled={busy}>Cancelar</button></div>
      </form>}
    </div>}

    {open && <ProductDetail card={open} onClose={() => setOpenId(null)}>{renderDetail?.(open, () => setOpenId(null))}</ProductDetail>}
  </div>;
}

function ProductDetail({ card, onClose, children }: { card: StoreCard; onClose: () => void; children?: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const image = card.images[active] ?? card.imageUrl;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={card.title} className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl bg-[var(--surface-strong)] shadow-2xl sm:rounded-2xl" onClick={event => event.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3">
        <span className="eyebrow !m-0">{card.stateLabel}</span>
        <button className="ddf-button secondary" onClick={onClose} autoFocus>Fechar</button>
      </div>
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <div className="aspect-square overflow-hidden rounded-xl bg-stone-100">
            {image ? <img src={image} alt={card.title} referrerPolicy="no-referrer" className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-sm text-[var(--muted)]">Sem foto</div>}
          </div>
          {card.images.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Todas as fotos">
            {card.images.map((url, index) => <button key={url} type="button" onClick={() => setActive(index)} className={`h-16 w-16 flex-none overflow-hidden rounded-md border-2 ${index === active ? 'border-[var(--ink)]' : 'border-transparent'}`} aria-label={`Foto ${index + 1}`}><img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /></button>)}
          </div>}
        </div>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold leading-snug tracking-tight sm:text-2xl">{card.fullTitle}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Custo" value={formatMoney(card.cost, card.currency)} />
            <Info label="Preço sugerido" value={card.suggestedPrice === null ? 'Sem cálculo no Pricing' : formatMoney(card.suggestedPrice, card.priceCurrency)} />
            <Info label="Estoque" value={card.stock === null ? 'Não informado' : card.stock.toLocaleString('pt-BR')} />
            <Info label="Fornecedor" value={card.supplierRef ? `${card.supplier} · ${card.supplierRef}` : card.supplier} />
            {card.category && <Info label="Categoria" value={card.category} />}
            {card.availability !== undefined || card.fiscalCompletion !== undefined ? <Info label="Disponibilidade" value={card.availability ? availabilityLabels[card.availability] : 'Sem definição'} /> : null}
            {card.fiscalCompletion !== undefined && <Info label="Cadastro fiscal" value={`${card.fiscalCompletion}% preenchido`} />}
          </dl>
          {card.url && <a className="inline-block break-all text-sm underline" href={card.url} target="_blank" rel="noreferrer noopener">Abrir página de origem</a>}
          <section><h3 className="font-semibold">Descrição do produto</h3><p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{card.description || 'Não informada pelo fornecedor.'}</p></section>
          {card.sourceDetails && <SupplierInformation supplier={card.sourceDetails} />}
          <section>
            <h3 className="font-semibold">Variantes ({card.variants.length})</h3>
            {card.variants.length ? <ul className="mt-2 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
              {card.variants.map(variant => <li key={variant.id} className="flex items-center gap-3 p-2 text-sm">
                {variant.imageUrl ? <img src={variant.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 flex-none rounded object-cover" /> : null}
                <div className="min-w-0 flex-1"><p className="font-medium">{variant.label}</p><p className="truncate text-xs text-[var(--muted)]">{variant.detail}</p></div>
                <div className="text-right text-xs"><p>{formatMoney(variant.price, card.currency)}</p><p className="text-[var(--muted)]">{variant.stock === null ? '' : `${variant.stock} un.`}</p></div>
              </li>)}
            </ul> : <p className="mt-2 text-sm text-[var(--muted)]">Nenhuma variante registrada.</p>}
          </section>
        </div>
      </div>
      {children && <div className="border-t border-[var(--line)] p-4 sm:p-6">{children}</div>}
    </div>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-[var(--canvas)] p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>;
}

function SupplierInformation({ supplier }: { supplier: NonNullable<StoreCard['sourceDetails']> }) {
  const missing = 'Ainda não confirmado';
  const sourceNames = { title: 'Título', description: 'Descrição', specification: 'Ficha técnica', variant: 'Variação', image: 'Foto' };
  const facts = [...new Map([...(supplier.facts ?? []), ...supplier.variants.flatMap(variant => variant.facts ?? [])].map(fact => [JSON.stringify(fact), fact])).values()];
  const conflicting = new Map<string, Set<number>>();
  for (const fact of facts) {
    const key = `${fact.sku ?? ''}:${fact.field}`;
    const values = conflicting.get(key) ?? new Set<number>(); values.add(fact.value); conflicting.set(key, values);
  }
  const conflicts = [...conflicting.values()].some(values => values.size > 1);
  const dimensions = (value: typeof supplier.dimensions) => value && Object.values(value).some(item => item !== undefined)
    ? [value.lengthCm, value.widthCm, value.heightCm].map(item => item === undefined ? '?' : item.toLocaleString('pt-BR')).join(' × ') + ' cm (C × L × A)' : missing;
  return <section className="space-y-3">
    <h3 className="font-semibold">Dados brutos do fornecedor</h3>
    <p className="text-sm text-[var(--muted)]">{supplier.vision?.completed ? 'Leitura das fotos concluída.' : supplier.images.length ? `Leitura das fotos pendente: ${supplier.vision?.processedImages.length ?? 0} de ${supplier.images.length} analisadas.` : 'Nenhuma foto disponível para leitura.'} Campos sem confirmação permanecem em aberto.</p>
    {conflicts && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Há medidas conflitantes nas fontes. Confira as evidências antes de concluir o cadastro.</p>}
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <Info label="Dimensões do produto" value={dimensions(supplier.dimensions)} />
      <Info label="Peso do produto" value={supplier.weightGrams === undefined ? missing : `${supplier.weightGrams.toLocaleString('pt-BR')} g`} />
      <Info label="Dimensões da embalagem" value={dimensions(supplier.packageDimensions)} />
      <Info label="Peso com embalagem" value={supplier.packageWeightGrams === undefined ? missing : `${supplier.packageWeightGrams.toLocaleString('pt-BR')} g`} />
      <Info label="Materiais" value={supplier.materials?.join(' · ') || missing} />
      <Info label="Características" value={supplier.features?.join(' · ') || missing} />
      <Info label="Prazo de entrega" value={supplier.shippingTime || missing} />
      <Info label="Frete" value={supplier.shippingCost === undefined ? missing : formatMoney(supplier.shippingCost, supplier.currency)} />
      <Info label="Vendas" value={supplier.sales === undefined ? missing : supplier.sales.toLocaleString('pt-BR')} />
      <Info label="Avaliação" value={supplier.rating === undefined ? missing : String(supplier.rating)} />
      <Info label="Número de avaliações" value={supplier.reviewCount === undefined ? missing : supplier.reviewCount.toLocaleString('pt-BR')} />
    </dl>
    {supplier.variants.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold">Medidas por variação ({supplier.variants.length})</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Variação / SKU</th><th className="p-2">Dimensões do produto</th><th className="p-2">Peso do produto</th></tr></thead><tbody>{supplier.variants.map(variant => <tr key={variant.sku}><td className="p-2">{variant.label}<br /><span className="text-xs text-[var(--muted)]">{variant.sku}</span></td><td className="p-2">{dimensions(variant.dimensions)}</td><td className="p-2">{variant.weightGrams === undefined ? missing : `${variant.weightGrams.toLocaleString('pt-BR')} g`}</td></tr>)}</tbody></table></div></details>}
    {facts.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold">Evidências das medidas ({facts.length})</summary><ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">{facts.map((fact, index) => <li key={index} className="rounded border border-[var(--line)] p-2"><p className="text-xs text-[var(--muted)]">{sourceNames[fact.source]}{fact.sku ? ` · SKU ${fact.sku}` : ' · sem SKU específico'}</p><p className="whitespace-pre-wrap">{fact.excerpt}</p><p>{fact.value.toLocaleString('pt-BR')} {fact.unit}</p>{fact.imageUrl && <a className="underline" href={fact.imageUrl} target="_blank" rel="noopener noreferrer">Abrir foto de origem</a>}</li>)}</ul></details>}
    <h4 className="text-sm font-semibold">Especificações técnicas originais</h4>
    {Object.keys(supplier.specifications ?? {}).length ? <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(supplier.specifications ?? {}).map(([key, value]) => <Info key={key} label={key} value={value} />)}</dl> : <p className="text-sm text-[var(--muted)]">{missing}</p>}
    {supplier.rawData && <details className="text-sm"><summary className="cursor-pointer font-semibold">Ver todos os dados originais recebidos do AliExpress</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--canvas)] p-3 text-xs">{JSON.stringify(supplier.rawData, null, 2)}</pre></details>}
  </section>;
}
