'use client';

import { useState, useSyncExternalStore } from 'react';
import { emptyIntake, INTAKE_STORAGE_KEY, type IntakeState } from '@/lib/intake';
import { emptyProductFactory, markProductReady, PRODUCT_STORAGE_KEY, productGaps, startProduct, updateProduct, type MasterProduct, type ProductFactoryState } from '@/lib/product-factory';
import { emptyMedia, hasApprovedMedia, MEDIA_STORAGE_KEY, type MediaState } from '@/lib/media-factory';

const eventName = 'ddf-products-change';
function subscribe(callback: () => void) { window.addEventListener('storage', callback); window.addEventListener(eventName, callback); return () => { window.removeEventListener('storage', callback); window.removeEventListener(eventName, callback); }; }
function snapshot() { try { return `${localStorage.getItem(INTAKE_STORAGE_KEY) ?? ''}\n${localStorage.getItem(PRODUCT_STORAGE_KEY) ?? ''}\n${localStorage.getItem(MEDIA_STORAGE_KEY) ?? ''}`; } catch { return 'unavailable'; } }
function parse(raw: string | null) {
  if (!raw) return { intake: emptyIntake, factory: emptyProductFactory, media: emptyMedia };
  const [intakeRaw, factoryRaw, mediaRaw] = raw.split('\n');
  const intake: IntakeState = intakeRaw ? JSON.parse(intakeRaw) : emptyIntake;
  const factory: ProductFactoryState = factoryRaw ? JSON.parse(factoryRaw) : emptyProductFactory;
  const media: MediaState = mediaRaw ? JSON.parse(mediaRaw) : emptyMedia;
  if (intake.version !== 1 || factory.version !== 1 || media.version !== 1 || !Array.isArray(intake.candidates) || !Array.isArray(factory.products) || !Array.isArray(media.assets)) throw new Error();
  return { intake, factory, media };
}
const lines = (value: FormDataEntryValue | null) => String(value ?? '').split('\n');

export function ProductFactoryWorkspace({ mode }: { mode: 'factory' | 'catalog' }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  let data = { intake: emptyIntake, factory: emptyProductFactory, media: emptyMedia }; let loadError = '';
  try { data = parse(raw); } catch { loadError = 'Os dados locais não puderam ser lidos. A edição foi bloqueada para protegê-los.'; }
  const [editing, setEditing] = useState<string | null>(null); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  const approved = data.intake.candidates.filter(c => c.status === 'APROVADO' && !data.factory.products.some(p => p.candidateId === c.id));
  const products = data.factory.products.filter(p => (mode === 'factory' || p.status === 'PRONTO') && p.universalTitle.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function persist(next: ProductFactoryState) { if (snapshot() !== raw) throw new Error('Os dados mudaram em outra aba. Revise antes de repetir.'); localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(next)); window.dispatchEvent(new Event(eventName)); setError(''); }
  function act(action: () => ProductFactoryState, success: string) { try { persist(action()); setMessage(success); setEditing(null); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir.'); } }
  return <div className="space-y-6">
    <header><p className="eyebrow">Produção / cadastro universal</p><h1 className="display-title">{mode === 'factory' ? 'Product Factory' : 'Produtos Disponíveis'}</h1><p className="lede">{mode === 'factory' ? 'Transforme candidatos aprovados em produtos mestres reutilizáveis.' : 'Catálogo de produtos prontos, ainda independentes de publicação.'}</p></header>
    <p className="surface p-4 text-sm">Demonstração local. Produto mestre não contém fornecedor, preço, canal ou publicação. Essas decisões permanecem independentes.</p>
    {(error || loadError) && <p role="alert" className="border border-red-300 bg-red-50 p-4 text-red-800">{error || loadError}</p>}<p role="status" className="text-sm text-green-800">{message}</p>
    {!loadError && mode === 'factory' && <section className="surface p-6"><h2 className="text-xl font-semibold">Fila aprovada</h2><p className="mt-2 text-sm text-gray-600">{approved.length} candidato(s) aguardando início explícito da produção.</p><div className="mt-4 space-y-3">{approved.map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3"><div><strong>{c.name}</strong><p className="text-sm text-gray-600">Aprovado na triagem</p></div><button className="ddf-button" onClick={() => act(() => startProduct(data.factory, c, crypto.randomUUID(), new Date().toISOString()), 'Produção iniciada. Nenhuma operação externa foi acionada.')}>Iniciar produção</button></div>)}{approved.length === 0 && <p className="mt-4">Nenhum candidato aprovado aguardando produção.</p>}</div></section>}
    <label className="block">Buscar produto<input className="ddf-input" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <p className="text-sm text-gray-600">{products.length} produto(s) nesta área</p>
    {products.length === 0 && <div className="surface p-8"><h2 className="text-lg font-semibold">{mode === 'catalog' ? 'Nenhum produto pronto' : 'A fábrica está vazia'}</h2><p className="mt-2">{mode === 'catalog' ? 'Finalize um cadastro mestre na Product Factory.' : 'Aprove um candidato na Sala de Triagem e inicie sua produção.'}</p></div>}
    {products.map(product => <ProductCard key={product.id} product={product} editable={mode === 'factory'} editing={editing === product.id} onEdit={() => setEditing(product.id)} onCancel={() => setEditing(null)} onSave={form => act(() => updateProduct(data.factory, product.id, { universalTitle: String(form.get('title')), category: String(form.get('category')), shortDescription: String(form.get('short')), longDescription: String(form.get('long')), bullets: lines(form.get('bullets')), benefits: lines(form.get('benefits')), tags: String(form.get('tags')).split(',') }, new Date().toISOString()), 'Rascunho salvo e nova versão registrada.')} onReady={() => act(() => markProductReady(data.factory, product.id, new Date().toISOString(), hasApprovedMedia(data.media, product.id)), 'Produto marcado como pronto. Nenhuma publicação foi iniciada.')} />)}
  </div>;
}

function ProductCard({ product, editable, editing, onEdit, onCancel, onSave, onReady }: { product: MasterProduct; editable: boolean; editing: boolean; onEdit: () => void; onCancel: () => void; onSave: (form: FormData) => void; onReady: () => void }) {
  const gaps = productGaps(product); const completion = Math.round(((6 - gaps.length) / 6) * 100);
  if (editing) return <form className="surface grid gap-4 p-6" onSubmit={e => { e.preventDefault(); onSave(new FormData(e.currentTarget)); }}><h2 className="text-xl font-semibold">Editar cadastro mestre</h2><label>Título universal<input name="title" defaultValue={product.universalTitle} className="ddf-input" /></label><label>Categoria<input name="category" defaultValue={product.category} className="ddf-input" /></label><label>Descrição curta<textarea name="short" defaultValue={product.shortDescription} className="ddf-input" rows={2} /></label><label>Descrição longa<textarea name="long" defaultValue={product.longDescription} className="ddf-input" rows={4} /></label><label>Bullets — um por linha<textarea name="bullets" defaultValue={product.bullets.join('\n')} className="ddf-input" rows={4} /></label><label>Benefícios — um por linha<textarea name="benefits" defaultValue={product.benefits.join('\n')} className="ddf-input" rows={3} /></label><label>Tags — separadas por vírgula<input name="tags" defaultValue={product.tags.join(', ')} className="ddf-input" /></label><div className="flex gap-3"><button className="ddf-button">Salvar versão</button><button type="button" className="ddf-button secondary" onClick={onCancel}>Cancelar</button></div></form>;
  return <article className="surface space-y-4 p-6"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">{product.universalTitle}</h2><p className="text-sm text-gray-600">{product.category || 'Categoria pendente'} · versão {product.version}</p></div><span className="rounded bg-stone-200 px-3 py-1 text-sm">{product.status === 'PRONTO' ? 'Pronto' : 'Em produção'}</span></div><p>{product.shortDescription || 'Descrição curta pendente.'}</p><div><div className="flex justify-between text-sm"><span>Completude essencial</span><strong>{completion}%</strong></div><div className="mt-2 h-2 bg-stone-200"><div className="h-2 bg-[#ff5b2e]" style={{ width: `${completion}%` }} /></div></div>{gaps.length > 0 && <p className="text-sm text-gray-600">Pendências: {gaps.join(', ')}.</p>}{editable && product.status === 'EM_PRODUCAO' && <div className="flex flex-wrap gap-3"><button className="ddf-button" onClick={onEdit}>Editar cadastro</button><button className="ddf-button secondary" onClick={onReady}>Marcar como pronto</button></div>}{product.status === 'PRONTO' && <p className="text-sm text-green-800">Disponível para futura estratégia de preço e distribuição; ainda não publicado.</p>}</article>;
}
