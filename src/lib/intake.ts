export type CandidateStatus = 'CANDIDATO' | 'TRIADO' | 'INFORMACAO_SOLICITADA' | 'APROVADO' | 'REJEITADO' | 'ARQUIVADO';
export type CandidateSource='MANUAL'|'TREND';
export type CandidateVariant = { sku: string; label: string; price: number | null; stock: number | null; imageUrl?: string };
// Structured supplier data captured on import; older candidates only carry it inside `notes`.
export type CandidateSupplier = { name: string; ref: string; cost: number | null; currency: string; stock: number | null; imageUrl: string; images: string[]; variants: CandidateVariant[] };
export type Candidate = { id: string; name: string; fullName?: string; url: string; notes: string; status: CandidateStatus; createdAt: string; source?:CandidateSource; region?:string; category?:string; evidence?:string[]; supplier?: CandidateSupplier };
export type CandidateInput = { name: string; fullName?: string; url: string; notes: string; source?:CandidateSource; region?:string; category?:string; evidence?:string[]; supplier?: CandidateSupplier };
export const CANDIDATE_NAME_MAX = 160;
export type DecisionEvent = { id: string; candidateId: string; name: string; before: CandidateStatus | null; after: CandidateStatus; reason: string; at: string; actor: string; snapshot?: Readonly<Candidate> };
export type IntakeState = { version: 1; candidates: Candidate[]; events: DecisionEvent[] };
export const INTAKE_STORAGE_KEY = 'ddf.intake.demo.v1';
export const emptyIntake: IntakeState = { version: 1, candidates: [], events: [] };
const transitions: Record<CandidateStatus, CandidateStatus[]> = {
  CANDIDATO: ['TRIADO', 'ARQUIVADO'], TRIADO: ['INFORMACAO_SOLICITADA', 'APROVADO', 'REJEITADO', 'ARQUIVADO'],
  INFORMACAO_SOLICITADA: ['TRIADO', 'REJEITADO', 'ARQUIVADO'],
  APROVADO: [], REJEITADO: [], ARQUIVADO: [],
};
export function normalizeUrl(value: string) {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Informe uma URL HTTP ou HTTPS sem credenciais.');
  url.hash = '';
  return url.href;
}
// Cuts on code points so emoji and accented characters are never split in half.
export function truncateName(value: string, max = CANDIDATE_NAME_MAX) {
  const clean = value.replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  return chars.length <= max ? clean : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}
export function addCandidate(state: IntakeState, input: CandidateInput, id: string, at: string, actor = 'Aprovador · controlado'): IntakeState {
  const name = input.name.trim();
  if (!name || Array.from(name).length > CANDIDATE_NAME_MAX) throw new Error('Informe um nome de até 160 caracteres.');
  const fullName = input.fullName?.trim();
  if (fullName && fullName.length > 2000) throw new Error('O nome completo deve ter até 2.000 caracteres.');
  if (input.notes.length > 2000) throw new Error('A observação deve ter até 2.000 caracteres.');
  const url = normalizeUrl(input.url);
  if (state.candidates.some(c => c.url === url)) throw new Error('Essa URL já está cadastrada. Consulte o candidato existente.');
  const candidate: Candidate = { id, name, url, notes: input.notes.trim(), source:input.source??'MANUAL',region:input.region?.trim(),category:input.category?.trim(),evidence:(input.evidence??[]).map(item=>item.trim()).filter(Boolean),status: 'CANDIDATO', createdAt: at };
  if (fullName && fullName !== name) candidate.fullName = fullName;
  if (input.supplier) candidate.supplier = input.supplier;
  return { ...state, candidates: [candidate, ...state.candidates], events: [{ id: `${id}:created`, candidateId: id, name, before: null, after: 'CANDIDATO', reason: candidate.notes, at, actor, snapshot: structuredClone(candidate) }, ...state.events] };
}
export function transitionCandidate(state: IntakeState, id: string, status: CandidateStatus, reason: string, eventId: string, at: string, actor = 'Aprovador · controlado'): IntakeState {
  const candidate = state.candidates.find(c => c.id === id);
  if (!candidate || !transitions[candidate.status].includes(status)) throw new Error('Transição indisponível para o estado atual.');
  if (!reason.trim() || reason.length > 2000) throw new Error('Registre uma justificativa de até 2.000 caracteres.');
  const nextCandidate = { ...candidate, status };
  return { ...state, candidates: state.candidates.map(c => c.id === id ? nextCandidate : c), events: [{ id: eventId, candidateId: id, name: candidate.name, before: candidate.status, after: status, reason: reason.trim(), at, actor, snapshot: structuredClone(nextCandidate) }, ...state.events] };
}
// Bulk decisions from the storefront. A shelf item (CANDIDATO) that is approved or rejected passes
// through TRIADO first, so the audit trail keeps both steps. Ineligible items are skipped, never forced.
export type BulkStatus = 'APROVADO' | 'REJEITADO' | 'ARQUIVADO';
export function bulkPath(from: CandidateStatus, to: BulkStatus): CandidateStatus[] | null {
  if (transitions[from].includes(to)) return [to];
  if (from === 'CANDIDATO' && transitions.TRIADO.includes(to)) return ['TRIADO', to];
  return null;
}
export function bulkTransitionCandidates(state: IntakeState, ids: string[], status: BulkStatus, reason: string, newId: () => string, at: string, actor = 'Aprovador · controlado') {
  if (!reason.trim() || reason.length > 2000) throw new Error('Registre uma justificativa de até 2.000 caracteres.');
  const unique = [...new Set(ids)];
  let next = state; const applied: string[] = []; const skipped: string[] = [];
  for (const id of unique) {
    const candidate = next.candidates.find(c => c.id === id);
    const path = candidate ? bulkPath(candidate.status, status) : null;
    if (!path) { skipped.push(id); continue; }
    for (const step of path) next = transitionCandidate(next, id, step, step === status ? reason : `Triagem em massa: ${reason}`, newId(), at, actor);
    applied.push(id);
  }
  if (!applied.length) throw new Error('Nenhum item selecionado aceita esta decisão no estado atual.');
  return { state: next, applied, skipped };
}
export function candidateDuplicates(state:IntakeState,input:{name:string;url:string}){let normalized='';try{normalized=normalizeUrl(input.url)}catch{}const name=input.name.trim().toLocaleLowerCase();return state.candidates.filter(candidate=>candidate.url===normalized||candidate.name.toLocaleLowerCase()===name||new URL(candidate.url).hostname===(normalized?new URL(normalized).hostname:''))}

export type CandidateFilters = { query?: string; source?: CandidateSource | ''; region?: string; category?: string; status?: CandidateStatus | ''; from?: string; to?: string };
export function filterCandidates(candidates: Candidate[], filters: CandidateFilters) {
  const query = filters.query?.trim().toLocaleLowerCase() ?? '';
  const from = filters.from ? Date.parse(`${filters.from}T00:00:00`) : Number.NEGATIVE_INFINITY;
  const to = filters.to ? Date.parse(`${filters.to}T23:59:59.999`) : Number.POSITIVE_INFINITY;
  return candidates.filter(candidate => {
    const created = Date.parse(candidate.createdAt);
    return (!query || `${candidate.name} ${candidate.url} ${candidate.notes}`.toLocaleLowerCase().includes(query))
      && (!filters.source || candidate.source === filters.source)
      && (!filters.region || candidate.region?.toLocaleLowerCase().includes(filters.region.toLocaleLowerCase()))
      && (!filters.category || candidate.category?.toLocaleLowerCase().includes(filters.category.toLocaleLowerCase()))
      && (!filters.status || candidate.status === filters.status)
      && created >= from && created <= to;
  });
}
