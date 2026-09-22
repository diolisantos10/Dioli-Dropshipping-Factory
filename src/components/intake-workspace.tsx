'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { addCandidate, emptyIntake, INTAKE_STORAGE_KEY, transitionCandidate, type CandidateStatus, type IntakeState } from '@/lib/intake';

const key = INTAKE_STORAGE_KEY;
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('ddf-intake-change', callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('ddf-intake-change', callback); };
}
function snapshot() {
  try { return localStorage.getItem(key) ?? ''; } catch { return 'unavailable'; }
}
const labels: Record<CandidateStatus, string> = { CANDIDATO: 'Na prateleira', TRIADO: 'Aguardando decisão', APROVADO: 'Aprovado', REJEITADO: 'Rejeitado', ARQUIVADO: 'Arquivado' };
export function IntakeWorkspace({ mode }: { mode: 'intake' | 'triage' | 'audit' | 'overview' }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  let state: IntakeState = emptyIntake;
  let storageError = '';
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1 || !Array.isArray(parsed.candidates) || !Array.isArray(parsed.events)
        || !parsed.candidates.every((c: Record<string, unknown>) => c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.url === 'string' && typeof c.notes === 'string' && typeof c.status === 'string' && Object.hasOwn(labels, c.status))
        || !parsed.events.every((e: Record<string, unknown>) => e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.reason === 'string' && typeof e.at === 'string' && typeof e.actor === 'string' && typeof e.after === 'string' && Object.hasOwn(labels, e.after))) throw new Error();
      state = parsed;
    }
  } catch { storageError = 'Não foi possível carregar os dados locais. Nenhum registro foi sobrescrito.'; }
  const ready = raw !== null && !storageError;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [decision, setDecision] = useState<{ id: string; status: CandidateStatus } | null>(null);
  function persist(next: IntakeState) {
    if (snapshot() !== raw) throw new Error('Os dados mudaram em outra aba. Revise a lista antes de repetir a ação.');
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event('ddf-intake-change'));
    setError('');
  }
  const candidates = state.candidates.filter(c => (mode !== 'triage' || c.status === 'TRIADO') && `${c.name} ${c.url}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="space-y-6">
    <header><p className="eyebrow">{mode === 'audit' ? 'Histórico de decisões' : 'Entrada → triagem → aprovação'}</p><h1 className="display-title">{mode === 'overview' ? 'Sua fábrica, em movimento.' : mode === 'intake' ? 'Prateleira Bruta' : mode === 'triage' ? 'Sala de Triagem' : 'Auditoria'}</h1></header>
    <p className="surface p-4 text-sm">Dados sincronizados com o PostgreSQL e auditados. Aprovações continuam explícitas e não iniciam processamento externo.</p>
    {(error || storageError) && <p role="alert" className="border border-red-300 bg-red-50 p-4 text-red-800">{error || storageError}</p>}
    <p role="status" className="text-sm text-green-800">{message}</p>
    {!ready ? <p>Cadastro indisponível até concluir a leitura dos dados.</p> : <>
      {mode === 'overview' && <><section className="grid gap-4 sm:grid-cols-3">{(['CANDIDATO', 'TRIADO', 'APROVADO'] as CandidateStatus[]).map(status => <article key={status} className="surface p-6"><h2>{labels[status]}</h2><p className="mt-4 text-4xl font-semibold">{state.candidates.filter(c => c.status === status).length}</p></article>)}</section><div className="flex flex-wrap gap-3"><Link className="ddf-button" href="/prateleira-bruta">Cadastrar oportunidade</Link><Link className="ddf-button secondary" href="/triagem">Revisar pendências</Link><Link className="ddf-button secondary" href="/auditoria">Ver histórico</Link></div><p>Produção, margem e integrações ainda não estão ativas. As contagens acima refletem os registros deste navegador.</p></>}
      {mode === 'intake' && <form className="surface grid gap-4 p-6" onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        try { persist(addCandidate(state, { name: String(data.get('name')), url: String(data.get('url')), notes: String(data.get('notes')),source:String(data.get('source')) as 'MANUAL'|'TREND',region:String(data.get('region')),category:String(data.get('category')),evidence:String(data.get('evidence')).split('\n') }, crypto.randomUUID(), new Date().toISOString())); form.reset(); setMessage('Candidato cadastrado. Nenhuma produção iniciada.'); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
      }}>
        <h2 className="text-xl font-semibold">Adicionar oportunidade</h2>
        <label>Nome do candidato<input name="name" required maxLength={160} className="ddf-input" /></label>
        <label>URL de origem<input name="url" type="url" required maxLength={2048} placeholder="https://" className="ddf-input" /></label>
        <div className="grid gap-4 sm:grid-cols-3"><label>Origem<select name="source" className="ddf-input"><option value="MANUAL">Manual</option><option value="TREND">Trend</option></select></label><label>Região<input name="region" className="ddf-input" placeholder="Brasil, UK…" /></label><label>Categoria sugerida<input name="category" className="ddf-input" /></label></div>
        <label>Evidências — uma por linha<textarea name="evidence" className="ddf-input" rows={3} placeholder="Fonte, sinal, referência…" /></label>
        <label>Por que vale avaliar?<textarea name="notes" maxLength={2000} className="ddf-input" rows={3} /></label>
        <button className="ddf-button" type="submit">Cadastrar candidato</button>
      </form>}
      {mode === 'overview' ? null : mode !== 'audit' ? <>
        <label className="block">Buscar candidatos<input className="ddf-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome ou URL" /></label>
        <p className="text-sm text-gray-600">{candidates.length} candidato(s) nesta lista</p>
        {candidates.length === 0 && <div className="surface p-8"><h2 className="text-lg font-semibold">{mode === 'triage' ? 'Nenhuma decisão pendente' : 'Nenhum candidato encontrado'}</h2><p className="mt-2">{mode === 'triage' ? 'Envie um candidato da Prateleira Bruta para começar.' : 'Cadastre uma oportunidade ou ajuste a busca.'}</p></div>}
        {candidates.map(c => <article key={c.id} className="surface space-y-3 p-6">
          <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">{c.name}</h2><span className="rounded bg-stone-200 px-3 py-1 text-sm">{labels[c.status]}</span></div>
          <p className="break-all text-sm text-gray-600">{c.url}</p><p className="text-sm text-gray-600">{c.source??'MANUAL'} · {c.region||'Região não informada'} · {c.category||'Categoria não informada'}</p><p className="whitespace-pre-wrap">{c.notes || 'Sem observações.'}</p>{c.evidence?.length?<ul className="list-disc pl-5 text-sm">{c.evidence.map(item=><li key={item}>{item}</li>)}</ul>:null}
          <div className="flex flex-wrap gap-3">
            {c.status === 'CANDIDATO' && <button className="ddf-button" onClick={() => setDecision({ id: c.id, status: 'TRIADO' })}>Enviar para triagem</button>}
            {c.status === 'TRIADO' && <><button className="ddf-button" onClick={() => setDecision({ id: c.id, status: 'APROVADO' })}>Avaliar aprovação</button><button className="ddf-button secondary" onClick={() => setDecision({ id: c.id, status: 'REJEITADO' })}>Rejeitar</button></>}
            {['CANDIDATO', 'TRIADO'].includes(c.status) && <button className="ddf-button secondary" onClick={() => setDecision({ id: c.id, status: 'ARQUIVADO' })}>Arquivar</button>}
          </div>
          {decision?.id === c.id && <form className="space-y-3 border-t border-stone-300 pt-4" onSubmit={e => {
            e.preventDefault(); const data = new FormData(e.currentTarget);
            try { persist(transitionCandidate(state, c.id, decision.status, String(data.get('reason')), crypto.randomUUID(), new Date().toISOString())); setDecision(null); setMessage('Decisão registrada no histórico local.'); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
          }}><p>Confirmar: <strong>{labels[decision.status]}</strong>. A decisão preservará o histórico do candidato.</p><label>Justificativa<textarea autoFocus name="reason" required maxLength={2000} rows={3} className="ddf-input" /></label><div className="flex gap-3"><button className="ddf-button" type="submit">Confirmar decisão</button><button className="ddf-button secondary" type="button" onClick={() => setDecision(null)}>Cancelar</button></div></form>}
        </article>)}
      </> : <section className="space-y-3">
        {state.events.length === 0 && <p className="surface p-8">As entradas e decisões aparecerão aqui.</p>}
        {state.events.map(event => <article key={event.id} className="surface space-y-2 p-5"><h2 className="font-semibold">{event.name}</h2><p>{event.before ? labels[event.before] : 'Nova entrada'} → {labels[event.after]}</p><p className="whitespace-pre-wrap">{event.reason || 'Sem observação'}</p><p className="text-xs text-gray-600">{event.actor} · {new Date(event.at).toLocaleString('pt-BR')}</p></article>)}
      </section>}
    </>}
  </div>;
}
