import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCandidate, emptyIntake, transitionCandidate } from '../src/lib/intake.ts';
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
