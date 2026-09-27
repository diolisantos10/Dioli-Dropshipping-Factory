'use client';

import { useMemo, useState } from 'react';
import { catalogRecords, type CatalogRecord, type CatalogState, type CurationStatus, type SupplierOffer } from '@/lib/catalog';
import { command, errorMessage, sendCommand, type Command } from '@/lib/command-client';
import { productGaps } from '@/lib/product-factory';
import { curationLabels, productCard } from '@/lib/storefront';
import { formatMoney as money, Storefront, type BulkAction, type StateOption } from '@/components/storefront';
import { useServerStates } from '@/components/use-server-states';

// Read straight from the server: /disponiveis must never depend on a browser cache being parseable.
const NAMESPACES = ['products', 'media', 'pricing', 'catalog', 'intake'] as const;
const list = (value: FormDataEntryValue | null) => String(value ?? '').split(',').map(item => item.trim()).filter(Boolean);
const bulkActions: BulkAction[] = [
  { status: 'APROVADO', label: 'Aprovar', tone: 'primary' },
  { status: 'REJEITADO', label: 'Rejeitar', tone: 'danger' },
  { status: 'ARQUIVADO', label: 'Arquivar' },
];
const stateOptions: StateOption[] = [
  { value: 'ATIVOS', label: 'Ativos (sem arquivados)' }, { value: '', label: 'Todos' },
  ...(['PRONTO', 'APROVADO', 'REJEITADO', 'ARQUIVADO'] as const).map(value => ({ value, label: curationLabels[value] })),
];

export function CatalogWorkspace() {
  const { states, status, fromCache, error: loadError, reload } = useServerStates(NAMESPACES);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const records = useMemo(() => catalogRecords(states.catalog, states.products.products, states.media.assets, states.pricing.calculations, states.products.events), [states]);
  const cards = useMemo(() => {
    const curation = new Map((states.catalog.curation ?? []).map(item => [item.productId, item.status]));
    const candidates = new Map(states.intake.candidates.map(item => [item.id, item]));
    return records.map(record => productCard(record, candidates.get(record.product.candidateId), curation.get(record.product.id)));
  }, [records, states.catalog.curation, states.intake.candidates]);
  function act(cmd: Command, success: string) { sendCommand(cmd).then(() => { setError(''); setMessage(success); }, cause => setError(errorMessage(cause))); }
  async function onBulk(ids: string[], target: string, reason: string) {
    try { await sendCommand(command('catalog.bulkCurate', { productIds: ids, status: target, reason })); }
    catch (cause) { throw new Error(errorMessage(cause, 'Não foi possível registrar a decisão.')); }
    return `${ids.length} produto(s) → ${curationLabels[target as CurationStatus]}. Registrado na auditoria; nada foi publicado.`;
  }
  const byId = new Map(records.map(record => [record.product.id, record]));
  const counts = { total: cards.length, approved: cards.filter(card => card.state === 'APROVADO').length, archived: cards.filter(card => card.state === 'ARQUIVADO').length };
  return <div className="space-y-6">
    <header><p className="eyebrow">Catálogo central / distribuição futura</p><h1 className="display-title">Produtos Disponíveis</h1><p className="lede">Vitrine dos produtos mestres prontos. Aprovar, rejeitar ou arquivar aqui não publica nada automaticamente.</p></header>
    {(error || loadError) && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-red-300 bg-red-50 p-4 text-red-800"><span>{error || loadError}</span>{loadError && <button className="ddf-button secondary" onClick={reload}>Tentar de novo</button>}</div>}
    <p role="status" className="text-sm text-green-800">{message}</p>
    <section className="grid grid-cols-3 gap-3 sm:gap-4"><Metric label="Produtos prontos" value={counts.total} /><Metric label="Aprovados" value={counts.approved} /><Metric label="Arquivados" value={counts.archived} /></section>
    {status === 'ready' && <PartyManager catalog={states.catalog} onSave={(kind, id, name) => act(command('catalog.upsertParty', { kind, id, name, active: true }), `${kind === 'brand' ? 'Marca' : 'Loja'} cadastrada.`)} />}
    <Storefront
      cards={cards} stateOptions={stateOptions} defaultState="ATIVOS" bulkActions={bulkActions} onBulk={onBulk}
      loading={status === 'loading' && !fromCache}
      emptyText="Finalize um Master Product na Product Factory ou ajuste os filtros."
      renderDetail={card => { const record = byId.get(card.id); return record ? <RecordDetail record={record} catalog={states.catalog} act={act} /> : null; }}
    />
  </div>;
}

function RecordDetail({ record, catalog, act }: { record: CatalogRecord; catalog: CatalogState; act: (cmd: Command, success: string) => void }) {
  const product = record.product;
  const gaps = [...productGaps(product), ...Object.entries(record.destinationGaps).flatMap(([destination, items]) => items.map(item => `${destination}: ${item}`))];
  return <div className="grid gap-6 lg:grid-cols-2">
    <Detail title="Ofertas e custos">{record.offers.length ? record.offers.map(item => <div className="border-t border-stone-200 py-3 text-sm" key={item.id}><strong>{item.supplierName} · {item.supplierRef}</strong><p>{money(item.cost, item.currency)} · estoque {item.stock ?? 'não informado'} · prazo {item.leadTimeDays ?? '—'} dias</p></div>) : <Empty text="Nenhuma Supplier Offer cadastrada." />}<OfferForm productId={product.id} onSave={input => act(command('catalog.addOffer', { ...input }), 'Oferta cadastrada sem acionar o fornecedor.')} /></Detail>
    <Detail title="Pricing disponível">{record.prices.length ? record.prices.map(item => <div className="border-t border-stone-200 py-3 text-sm" key={item.id}><strong>{item.channel || 'Sem canal'} · {item.store || 'Sem loja'} · {item.status}</strong><p>Custo real {money(item.totalFixedCost, item.currency)} · sugerido {item.suggestedPrice === null ? 'bloqueado' : money(item.suggestedPrice, item.currency)}</p></div>) : <Empty text="Nenhum cálculo de preço." />}</Detail>
    <Detail title="Destinos e gaps"><p className="text-sm"><strong>Elegíveis:</strong> {record.assignment.destinations.join(', ') || 'nenhum selecionado'}</p>{gaps.length ? <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">{gaps.map(item => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-green-800">Sem gaps registrados.</p>}</Detail>
    <Detail title="Histórico">{record.history.length ? record.history.map(item => <p className="border-t border-stone-200 py-2 text-sm" key={item.id}>{item.action.replaceAll('_', ' ')} · versão {item.version} · {new Date(item.at).toLocaleString('pt-BR')}</p>) : <Empty text="Sem eventos registrados." />}</Detail>
    <div className="lg:col-span-2"><AssignmentForm productId={product.id} assignment={record.assignment} brands={catalog.brands} stores={catalog.stores} onSave={input => act(command('catalog.assignProduct', { productId: product.id, ...input }), 'Associações e destinos atualizados. Nenhuma publicação foi iniciada.')} /></div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="surface p-4 sm:p-5"><p className="text-xs text-gray-600 sm:text-sm">{label}</p><strong className="mt-1 block text-2xl sm:text-3xl">{value}</strong></div>; }
function Detail({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="text-lg font-semibold">{title}</h3><div className="mt-3">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <p className="text-sm text-gray-600">{text}</p>; }
function PartyManager({ catalog, onSave }: { catalog: CatalogState; onSave: (kind: 'brand'|'store', id: string, name: string) => void }) { return <details className="surface p-5"><summary className="cursor-pointer font-semibold">Gerenciar marcas e lojas</summary><p className="mt-2 text-sm text-gray-600">Dimensões comerciais reutilizáveis. Um produto pode pertencer a várias marcas e lojas.</p><form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('name')); const id = name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-'); onSave(String(form.get('kind')) as 'brand'|'store', id, name); event.currentTarget.reset(); }}><label>Tipo<select name="kind" className="ddf-input"><option value="brand">Marca</option><option value="store">Loja</option></select></label><label>Nome<input name="name" required className="ddf-input" /></label><button className="ddf-button self-end">Cadastrar dimensão</button></form><p className="mt-4 text-sm">Marcas: {catalog.brands.map(item => item.name).join(', ') || '—'} · Lojas: {catalog.stores.map(item => item.name).join(', ') || '—'}</p></details>; }
function AssignmentForm({ productId, assignment, brands, stores, onSave }: { productId: string; assignment: { brandIds: string[]; storeIds: string[]; destinations: string[] }; brands: CatalogState['brands']; stores: CatalogState['stores']; onSave: (input: { brandIds: string[]; storeIds: string[]; destinations: string[] }) => void }) { return <form className="mt-6 grid gap-4 border-t border-stone-200 pt-6 md:grid-cols-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ brandIds: form.getAll('brands').map(String), storeIds: form.getAll('stores').map(String), destinations: list(form.get('destinations')) }); }}><fieldset><legend className="font-semibold">Marcas</legend>{brands.map(item => <label className="mt-2 flex gap-2 text-sm" key={item.id}><input type="checkbox" name="brands" value={item.id} defaultChecked={assignment.brandIds.includes(item.id)} />{item.name}</label>)}</fieldset><fieldset><legend className="font-semibold">Lojas</legend>{stores.map(item => <label className="mt-2 flex gap-2 text-sm" key={item.id}><input type="checkbox" name="stores" value={item.id} defaultChecked={assignment.storeIds.includes(item.id)} />{item.name}</label>)}{stores.length === 0 && <Empty text="Cadastre uma loja acima." />}</fieldset><label>Destinos elegíveis — separados por vírgula<input key={`${productId}:${assignment.destinations.join('|')}`} name="destinations" className="ddf-input" defaultValue={assignment.destinations.join(', ')} /><button className="ddf-button mt-4">Salvar associações</button></label></form>; }
function OfferForm({ productId, onSave }: { productId: string; onSave: (input: Omit<SupplierOffer, 'id' | 'updatedAt'>) => void }) { return <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Cadastrar Supplier Offer</summary><form className="mt-3 grid gap-3 text-sm sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const nullable = (name: string) => String(form.get(name)).trim() === '' ? null : Number(form.get(name)); onSave({ productId, supplierName: String(form.get('supplierName')), supplierRef: String(form.get('supplierRef')), cost: Number(form.get('cost')), currency: String(form.get('currency')), stock: nullable('stock'), leadTimeDays: nullable('leadTimeDays') }); event.currentTarget.reset(); }}><label>Fornecedor<input required name="supplierName" className="ddf-input" /></label><label>Referência<input required name="supplierRef" className="ddf-input" /></label><label>Custo<input required name="cost" type="number" min="0" step="0.01" className="ddf-input" /></label><label>Moeda<input required name="currency" defaultValue="BRL" className="ddf-input" /></label><label>Estoque<input name="stock" type="number" min="0" step="1" className="ddf-input" /></label><label>Prazo em dias<input name="leadTimeDays" type="number" min="0" step="1" className="ddf-input" /></label><button className="ddf-button sm:col-span-2">Salvar oferta</button></form></details>; }
