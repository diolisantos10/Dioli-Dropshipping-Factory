import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCandidate, emptyIntake, filterCandidates, transitionCandidate } from '../src/lib/intake.ts';
const at = '2026-09-20T12:00:00Z';
const created = () => addCandidate(emptyIntake, { name: 'Produto', url: 'https://example.com/item', notes: 'Avaliar' }, 'c1', at);
test('cadastro não aprova nem inicia produção', () => {
  const s = created(); assert.equal(s.candidates[0].status, 'CANDIDATO'); assert.equal(s.events.length, 1); assert.equal(emptyIntake.candidates.length, 0);
});
test('aprovação só após triagem e com justificativa', () => {
  assert.throws(() => transitionCandidate(created(), 'c1', 'APROVADO', 'Sim', 'e1', at));
  const s = transitionCandidate(created(), 'c1', 'TRIADO', 'Avaliar', 'e1', at);
  assert.throws(() => transitionCandidate(s, 'c1', 'APROVADO', ' ', 'e2', at));
  const approved = transitionCandidate(s, 'c1', 'APROVADO', 'Evidências revisadas', 'e2', at);
  assert.equal(approved.events[0].before, 'TRIADO'); assert.equal(approved.events[0].after, 'APROVADO'); assert.equal(approved.events.length, 3);
  assert.throws(() => transitionCandidate(approved, 'c1', 'APROVADO', 'Repetição', 'e3', at));
});
test('rejeição preserva candidato e histórico', () => {
  const s = transitionCandidate(created(), 'c1', 'TRIADO', 'Avaliar', 'e1', at);
  const rejected = transitionCandidate(s, 'c1', 'REJEITADO', 'Sem evidências', 'e2', at);
  assert.equal(rejected.candidates.length, 1); assert.equal(rejected.events.length, 3);
});
test('URL inválida, credenciais e duplicatas são rejeitadas', () => {
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.com', 'invalid']) assert.throws(() => addCandidate(emptyIntake, {name: 'Item', url, notes: ''}, 'c2', at));
  assert.throws(() => addCandidate(created(), {name: 'Outro', url: 'https://example.com/item#fragment', notes: ''}, 'c2', at));
});
test('origem, região, categoria e evidências são preservadas',()=>{const state=addCandidate(emptyIntake,{name:'Trend Brasil',url:'https://example.com/trend',notes:'Sinal validado',source:'TREND',region:'BR',category:'Casa',evidence:['Busca crescente','Fonte pública']},'trend-1','2026-01-01T00:00:00Z');const candidate=state.candidates[0];assert.equal(candidate.source,'TREND');assert.equal(candidate.region,'BR');assert.equal(candidate.category,'Casa');assert.deepEqual(candidate.evidence,['Busca crescente','Fonte pública'])});
test('solicitação de informação retorna à triagem e preserva snapshots',()=>{let state=transitionCandidate(created(),'c1','TRIADO','Avaliar','e1',at);state=transitionCandidate(state,'c1','INFORMACAO_SOLICITADA','Enviar certificação','e2',at);assert.equal(state.events[0].snapshot.status,'INFORMACAO_SOLICITADA');state=transitionCandidate(state,'c1','TRIADO','Certificação recebida','e3',at);assert.equal(state.candidates[0].status,'TRIADO');assert.equal(state.events[1].snapshot.status,'INFORMACAO_SOLICITADA')});
test('filtros combinam origem, região, categoria, status e período',()=>{let state=addCandidate(emptyIntake,{name:'Trend Brasil',url:'https://example.com/trend',notes:'Sinal',source:'TREND',region:'BR',category:'Casa'},'a','2026-01-10T12:00:00Z');state=addCandidate(state,{name:'Manual UK',url:'https://example.org/item',notes:'Outro',source:'MANUAL',region:'UK',category:'Moda'},'b','2026-02-10T12:00:00Z');const result=filterCandidates(state.candidates,{query:'trend',source:'TREND',region:'br',category:'casa',status:'CANDIDATO',from:'2026-01-01',to:'2026-01-31'});assert.deepEqual(result.map(item=>item.id),['a'])});
test('decisão em massa: produção exige reserva na triagem e ignora itens inelegíveis',async()=>{const{bulkTransitionCandidates}=await import('../src/lib/intake.ts');let state=addCandidate(emptyIntake,{name:'A',url:'https://example.com/a',notes:''},'a',at);state=addCandidate(state,{name:'B',url:'https://example.com/b',notes:''},'b',at);state=addCandidate(state,{name:'C',url:'https://example.com/c',notes:''},'c',at);state=transitionCandidate(state,'a','TRIADO','Reservar','ea',at);state=transitionCandidate(state,'b','TRIADO','Reservar','eb',at);state=transitionCandidate(state,'c','ARQUIVADO','fora','e0',at);let n=0;const result=bulkTransitionCandidates(state,['a','b','c','x'],'APROVADO','Lote bom',()=>`id${n++}`,at,'dioli');assert.deepEqual(result.applied,['a','b']);assert.deepEqual(result.skipped,['c','x']);assert.equal(result.state.candidates.find(c=>c.id==='a').status,'APROVADO');const trail=result.state.events.filter(e=>e.candidateId==='a').map(e=>e.after);assert.deepEqual(trail,['APROVADO','TRIADO','CANDIDATO']);assert.equal(result.state.candidates.find(c=>c.id==='c').status,'ARQUIVADO')});
test('decisão em massa exige justificativa e ao menos um item elegível',async()=>{const{bulkTransitionCandidates}=await import('../src/lib/intake.ts');const state=created();assert.throws(()=>bulkTransitionCandidates(state,['c1'],'ARQUIVADO',' ',()=>'x',at),/justificativa/);const archived=bulkTransitionCandidates(state,['c1'],'ARQUIVADO','Sem interesse',()=>'x',at).state;assert.throws(()=>bulkTransitionCandidates(archived,['c1'],'REJEITADO','De novo',()=>'y',at),/Nenhum item/)});

test('reserva em massa na triagem preserva dados e não autoriza produção', async () => {
  const { bulkTransitionCandidates } = await import('../src/lib/intake.ts');
  const state = addCandidate(emptyIntake, { name: 'A', url: 'https://example.com/reserve', notes: 'Lançamento futuro' }, 'reserved', at);
  const result = bulkTransitionCandidates(state, ['reserved'], 'TRIADO', 'Separar para mês seguinte', () => 'event', at);
  assert.equal(result.state.candidates[0].status, 'TRIADO');
  assert.equal(result.state.candidates[0].notes, 'Lançamento futuro');
  assert.equal(result.state.events.some(event => event.after === 'APROVADO'), false);
});

test('aprovação em massa não pode pular reserva na triagem', async () => {
  const { bulkTransitionCandidates } = await import('../src/lib/intake.ts');
  assert.throws(() => bulkTransitionCandidates(created(), ['c1'], 'APROVADO', 'Produzir', () => 'event', at), /Nenhum item/);
});
test('atualizar dados brutos preserva reserva, fonte e autorização', async () => {
  const { refreshCandidateSupplier } = await import('../src/lib/intake.ts');
  const state = transitionCandidate(created(), 'c1', 'TRIADO', 'Reservar', 'e1', at);
  const supplier = { name: 'AliExpress', ref: '1', cost: 1, currency: 'BRL', stock: null, images: [], imageUrl: '', variants: [], description: 'Detalhes novos' };
  const refreshed = refreshCandidateSupplier(state, 'c1', supplier, 'refresh', at, 'Sistema');
  assert.equal(refreshed.candidates[0].status, 'TRIADO');
  assert.equal(refreshed.candidates[0].url, state.candidates[0].url);
  assert.equal(refreshed.candidates[0].supplier.description, 'Detalhes novos');
  assert.equal(refreshed.events[0].before, 'TRIADO');
  assert.equal(refreshed.events[0].after, 'TRIADO');
});
