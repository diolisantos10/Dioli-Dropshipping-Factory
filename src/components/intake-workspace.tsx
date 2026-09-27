'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { bulkPath, type BulkStatus, type CandidateStatus } from '@/lib/intake';
import { command, errorMessage, sendCommand } from '@/lib/command-client';
import { candidateCard, candidateStateLabels as labels } from '@/lib/storefront';
import { Storefront, type BulkAction, type StateOption } from '@/components/storefront';
import { useServerStates } from '@/components/use-server-states';

const NAMESPACES = ['intake'] as const;
const TRIAGE_STATES: CandidateStatus[] = ['TRIADO', 'INFORMACAO_SOLICITADA'];
const bulkActions: BulkAction[] = [
  { status: 'APROVADO', label: 'Aprovar', tone: 'primary' },
  { status: 'REJEITADO', label: 'Rejeitar', tone: 'danger' },
  { status: 'ARQUIVADO', label: 'Arquivar' },
];
const stepActions: Partial<Record<CandidateStatus, { status: CandidateStatus; label: string }[]>> = {
  CANDIDATO: [{ status: 'TRIADO', label: 'Enviar para triagem' }],
  TRIADO: [{ status: 'INFORMACAO_SOLICITADA', label: 'Solicitar informações' }],
  INFORMACAO_SOLICITADA: [{ status: 'TRIADO', label: 'Informações recebidas' }],
};

export function IntakeWorkspace({ mode }: { mode: 'intake' | 'triage' | 'audit' | 'overview' }) {
  const { states, status, fromCache, error: loadError, reload } = useServerStates(NAMESPACES);
  const state = states.intake;
  const ready = status === 'ready' || fromCache;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const pool = useMemo(() => mode === 'triage' ? state.candidates.filter(c => TRIAGE_STATES.includes(c.status)) : state.candidates, [mode, state.candidates]);
  const cards = useMemo(() => pool.map(candidateCard), [pool]);
  const stateOptions: StateOption[] = mode === 'triage'
    ? [{ value: '', label: 'Todos pendentes' }, ...TRIAGE_STATES.map(value => ({ value, label: labels[value] }))]
    : [{ value: '', label: 'Todos' }, ...(Object.keys(labels) as CandidateStatus[]).map(value => ({ value, label: labels[value] }))];

  async function onBulk(ids: string[], target: string, reason: string) {
    const byId = new Map(state.candidates.map(c => [c.id, c]));
    const eligible = ids.filter(id => { const c = byId.get(id); return !!c && !!bulkPath(c.status, target as BulkStatus); });
    if (!eligible.length) throw new Error('Nenhum item selecionado aceita esta decisão no estado atual.');
    try { await sendCommand(command('intake.bulkTransition', { candidateIds: eligible, status: target, reason })); }
    catch (cause) { throw new Error(errorMessage(cause, 'Não foi possível registrar a decisão.')); }
    const skipped = ids.length - eligible.length;
    return `${eligible.length} produto(s) → ${labels[target as CandidateStatus]}.${skipped ? ` ${skipped} ignorado(s) por não aceitarem esta decisão.` : ''} Registrado na auditoria.`;
  }

  return <div className="space-y-6">
    <header><p className="eyebrow">{mode === 'audit' ? 'Histórico de decisões' : 'Entrada → triagem → aprovação'}</p><h1 className="display-title">{mode === 'overview' ? 'Sua fábrica, em movimento.' : mode === 'intake' ? 'Prateleira Bruta' : mode === 'triage' ? 'Sala de Triagem' : 'Auditoria'}</h1></header>
    {(error || loadError) && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-red-300 bg-red-50 p-4 text-red-800"><span>{error || loadError}</span>{loadError && <button className="ddf-button secondary" onClick={reload}>Tentar de novo</button>}</div>}
    <p role="status" className="text-sm text-green-800">{message}</p>
    {!ready ? <p className="surface p-6 text-sm">Carregando dados do servidor…</p> : <>
      {mode === 'overview' && <><section className="grid gap-4 sm:grid-cols-3">{(['CANDIDATO', 'TRIADO', 'APROVADO'] as CandidateStatus[]).map(value => <article key={value} className="surface p-6"><h2>{labels[value]}</h2><p className="mt-4 text-4xl font-semibold">{state.candidates.filter(c => c.status === value).length}</p></article>)}</section><div className="flex flex-wrap gap-3"><Link className="ddf-button" href="/prateleira-bruta">Cadastrar oportunidade</Link><Link className="ddf-button secondary" href="/triagem">Revisar pendências</Link><Link className="ddf-button secondary" href="/auditoria">Ver histórico</Link></div></>}
      {mode === 'intake' && <details className="surface p-5">
        <summary className="cursor-pointer font-semibold">Adicionar oportunidade manual</summary>
        <form className="mt-4 grid gap-4" onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
          sendCommand(command('intake.addCandidate', { name: String(data.get('name')), url: String(data.get('url')), notes: String(data.get('notes')), source: String(data.get('source')), region: String(data.get('region')), category: String(data.get('category')), evidence: String(data.get('evidence')).split('\n') })).then(() => { form.reset(); setError(''); setMessage('Candidato cadastrado. Nenhuma produção iniciada.'); }, e => setError(errorMessage(e, 'Não foi possível salvar.')));
        }}>
          <label>Nome do candidato<input name="name" required maxLength={160} className="ddf-input" /></label>
          <label>URL de origem<input name="url" type="url" required maxLength={2048} placeholder="https://" className="ddf-input" /></label>
          <div className="grid gap-4 sm:grid-cols-3"><label>Origem<select name="source" className="ddf-input"><option value="MANUAL">Manual</option><option value="TREND">Trend</option></select></label><label>Região<input name="region" className="ddf-input" placeholder="Brasil, UK…" /></label><label>Categoria sugerida<input name="category" className="ddf-input" /></label></div>
          <label>Evidências — uma por linha<textarea name="evidence" className="ddf-input" rows={3} placeholder="Fonte, sinal, referência…" /></label>
          <label>Por que vale avaliar?<textarea name="notes" maxLength={2000} className="ddf-input" rows={3} /></label>
          <button className="ddf-button" type="submit">Cadastrar candidato</button>
        </form>
      </details>}
      {(mode === 'intake' || mode === 'triage') && <Storefront
        cards={cards} stateOptions={stateOptions} defaultState={mode === 'intake' ? 'CANDIDATO' : ''} bulkActions={bulkActions} onBulk={onBulk}
        loading={status === 'loading' && !fromCache}
        emptyText={mode === 'triage' ? 'Envie produtos da Prateleira Bruta para a triagem ou ajuste os filtros.' : 'Importe do AliExpress em Integrações, cadastre uma oportunidade ou ajuste os filtros.'}
        renderDetail={card => {
          const candidate = state.candidates.find(c => c.id === card.id);
          if (!candidate) return null;
          return <CandidateSteps key={candidate.id} status={candidate.status} evidence={candidate.evidence ?? []} onStep={(next, reason) => sendCommand(command('intake.transition', { candidateId: candidate.id, status: next, reason })).then(() => { setError(''); setMessage('Decisão registrada e auditada no servidor.'); })} />;
        }}
      />}
      {mode === 'audit' && <section className="space-y-3">
        {state.events.length === 0 && <p className="surface p-8">As entradas e decisões aparecerão aqui.</p>}
        {state.events.map(event => <article key={event.id} className="surface space-y-2 p-5"><h2 className="font-semibold">{event.name}</h2><p>{event.before ? labels[event.before] : 'Nova entrada'} → {labels[event.after]}</p><p className="whitespace-pre-wrap">{event.reason || 'Sem observação'}</p>{event.snapshot && <details className="text-sm"><summary>Snapshot imutável da decisão</summary><pre className="mt-2 overflow-auto rounded bg-stone-100 p-3 text-xs">{JSON.stringify(event.snapshot, null, 2)}</pre></details>}<p className="text-xs text-gray-600">{event.actor} · {new Date(event.at).toLocaleString('pt-BR')}</p></article>)}
      </section>}
    </>}
  </div>;
}

// Single-item steps that are not part of the bulk bar (triage hand-off and information requests).
function CandidateSteps({ status, evidence, onStep }: { status: CandidateStatus; evidence: string[]; onStep: (status: CandidateStatus, reason: string) => Promise<void> }) {
  const [pending, setPending] = useState<CandidateStatus | null>(null);
  const [error, setError] = useState('');
  const actions = stepActions[status] ?? [];
  return <div className="space-y-3">
    {evidence.length > 0 && <div><h3 className="font-semibold">Evidências</h3><ul className="mt-1 list-disc pl-5 text-sm">{evidence.map(item => <li key={item}>{item}</li>)}</ul></div>}
    {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions.map(action => <button key={action.status} className="ddf-button secondary" onClick={() => setPending(action.status)}>{action.label}</button>)}</div>}
    {pending && <form className="space-y-2" onSubmit={event => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')); onStep(pending, reason).then(() => setPending(null), cause => setError(errorMessage(cause, 'Não foi possível salvar.'))); }}>
      <p className="text-sm">Confirmar: <strong>{labels[pending]}</strong>. O histórico do candidato é preservado.</p>
      <label className="block text-sm">Justificativa<textarea autoFocus name="reason" required maxLength={2000} rows={2} className="ddf-input" /></label>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex gap-2"><button className="ddf-button" type="submit">Confirmar</button><button className="ddf-button secondary" type="button" onClick={() => setPending(null)}>Cancelar</button></div>
    </form>}
  </div>;
}
