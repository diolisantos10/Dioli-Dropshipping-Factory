'use client';
import { useCallback, useEffect, useState } from 'react';
import type { BrandBrief } from '@/lib/brand-discovery-rules';
type BriefStatus = { brief: BrandBrief; status: string; message: string; lastRunAt: string | null; dailyImported: number };
type Snapshot = { ai?: { configured: boolean; message: string | null }; supplier: { name: string; status: string } | null; briefs: BriefStatus[] };
const statuses: Record<string, string> = { WAITING: 'Aguardando primeira busca', SUCCEEDED: 'Busca concluída', FAILED: 'Falha na busca', BLOCKED: 'Conexão pendente' };
export function BrandDiscoveryWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ supplier: null, briefs: [] });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    try { const response = await fetch('/api/briefings', { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setSnapshot(data); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Briefings indisponíveis.'); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  function change(key: string, patch: Partial<BrandBrief>) { setSnapshot(current => ({ ...current, briefs: current.briefs.map(item => item.brief.key === key ? { ...item, brief: { ...item.brief, ...patch } } : item) })); }
  async function operate(action: 'save' | 'run', brief?: BrandBrief) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/briefings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, brief }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setMessage(action === 'save' ? 'Briefing salvo. Novas buscas usarão esta versão.' : data.skipped || `${data.imported ?? 0} candidato(s) novo(s). Consulte o resultado de cada marca abaixo.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Operação indisponível.'); } finally { setBusy(false); }
  }
  return <div className="space-y-6"><header><p className="eyebrow">Curadoria / entrada automática</p><h1 className="display-title">Briefings das marcas</h1><p className="lede">Busca de candidatos no AliExpress para Dilly e Santioh. Você escolhe o que produzir e o que enviar às lojas.</p></header>
    <section className="surface flex flex-wrap items-center justify-between gap-4 p-5"><div><strong>{snapshot.supplier ? `AliExpress conectado: ${snapshot.supplier.name}` : 'AliExpress: conexão necessária'}</strong><p className="mt-2 text-sm text-gray-600">Consultas automáticas pela API do fornecedor, com regras e limites por marca. {snapshot.ai?.configured ? 'Curadoria textual por IA conectada.' : 'Curadoria por IA pendente de configuração; busca por consultas e regras.'} Busca a cada hora; a rotina da Factory verifica as filas a cada 15 minutos.</p><p className="mt-1 text-sm text-gray-600">Os candidatos ficam na Prateleira Bruta. A busca não aprova, produz ou publica produtos.</p></div><button className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy || !snapshot.supplier} onClick={() => void operate('run')}>{busy ? 'Processando…' : 'Verificar busca agora'}</button></section>
    {message && <p role="status" className="surface p-4 text-sm">{message}</p>}
    <div className="grid items-start gap-6 xl:grid-cols-2">{snapshot.briefs.map(item => <article key={item.brief.key} className="surface space-y-4 p-5"><div className="flex justify-between gap-4"><div><h2 className="text-2xl font-semibold">{item.brief.name}</h2><p className="mt-1 text-sm text-gray-600">Versão {item.brief.version} · {item.dailyImported}/{item.brief.dailyLimit} candidatos hoje</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.brief.enabled} disabled={busy} onChange={event => change(item.brief.key, { enabled: event.target.checked })} />Busca ativa</label></div>
      <p className="rounded bg-stone-100 p-3 text-xs text-gray-700">{item.brief.basis}</p>
      <label className="block text-sm font-medium">Posicionamento<textarea className="mt-1 w-full rounded border border-stone-300 p-2 text-sm font-normal" rows={3} value={item.brief.positioning} onChange={event => change(item.brief.key, { positioning: event.target.value })} /></label>
      <label className="block text-sm font-medium">Público<textarea className="mt-1 w-full rounded border border-stone-300 p-2 text-sm font-normal" rows={2} value={item.brief.audience} onChange={event => change(item.brief.key, { audience: event.target.value })} /></label>
      {(['categories', 'criteria', 'exclusions', 'queries'] as const).map(field => <label className="block text-sm font-medium" key={field}>{{ categories: 'Categorias', criteria: 'Critérios de seleção', exclusions: 'Exclusões', queries: 'Consultas no AliExpress' }[field]} <span className="font-normal text-gray-500">(uma por linha)</span><textarea className="mt-1 w-full rounded border border-stone-300 p-2 text-sm font-normal" rows={field === 'queries' ? 4 : 3} value={item.brief[field].join('\n')} onChange={event => change(item.brief.key, { [field]: event.target.value.split('\n') })} /></label>)}
      <label className="block text-sm font-medium">Limite de novos candidatos por dia<input className="ml-3 w-20 rounded border border-stone-300 p-2 font-normal" type="number" min={1} max={30} value={item.brief.dailyLimit} onChange={event => change(item.brief.key, { dailyLimit: Number(event.target.value) })} /></label>
      <button className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => void operate('save', item.brief)}>Salvar briefing</button>
      <div className="border-t border-stone-200 pt-4 text-sm"><strong>{statuses[item.status] ?? item.status}</strong>{item.lastRunAt && <p className="mt-1 text-xs text-gray-500">Última busca: {new Date(item.lastRunAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}<p className="mt-2 break-words text-gray-600">{item.message || 'A próxima rotina automática verificará esta marca.'}</p></div>
    </article>)}</div>
  </div>;
}
