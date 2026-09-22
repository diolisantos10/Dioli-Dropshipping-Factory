export type CandidateStatus = 'CANDIDATO' | 'TRIADO' | 'INFORMACAO_SOLICITADA' | 'APROVADO' | 'REJEITADO' | 'ARQUIVADO';
export type CandidateSource='MANUAL'|'TREND';
export type Candidate = { id: string; name: string; url: string; notes: string; status: CandidateStatus; createdAt: string; source?:CandidateSource; region?:string; category?:string; evidence?:string[] };
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
export function addCandidate(state: IntakeState, input: { name: string; url: string; notes: string; source?:CandidateSource; region?:string; category?:string; evidence?:string[] }, id: string, at: string): IntakeState {
  const name = input.name.trim();
  if (!name || name.length > 160) throw new Error('Informe um nome de até 160 caracteres.');
  if (input.notes.length > 2000) throw new Error('A observação deve ter até 2.000 caracteres.');
  const url = normalizeUrl(input.url);
  if (state.candidates.some(c => c.url === url)) throw new Error('Essa URL já está cadastrada. Consulte o candidato existente.');
  const candidate: Candidate = { id, name, url, notes: input.notes.trim(), source:input.source??'MANUAL',region:input.region?.trim(),category:input.category?.trim(),evidence:(input.evidence??[]).map(item=>item.trim()).filter(Boolean),status: 'CANDIDATO', createdAt: at };
  return { ...state, candidates: [candidate, ...state.candidates], events: [{ id: `${id}:created`, candidateId: id, name, before: null, after: 'CANDIDATO', reason: candidate.notes, at, actor: 'Aprovador · controlado', snapshot: structuredClone(candidate) }, ...state.events] };
}
export function transitionCandidate(state: IntakeState, id: string, status: CandidateStatus, reason: string, eventId: string, at: string): IntakeState {
  const candidate = state.candidates.find(c => c.id === id);
  if (!candidate || !transitions[candidate.status].includes(status)) throw new Error('Transição indisponível para o estado atual.');
  if (!reason.trim() || reason.length > 2000) throw new Error('Registre uma justificativa de até 2.000 caracteres.');
  const nextCandidate = { ...candidate, status };
  return { ...state, candidates: state.candidates.map(c => c.id === id ? nextCandidate : c), events: [{ id: eventId, candidateId: id, name: candidate.name, before: candidate.status, after: status, reason: reason.trim(), at, actor: 'Aprovador · controlado', snapshot: structuredClone(nextCandidate) }, ...state.events] };
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
