import test from 'node:test';
import assert from 'node:assert/strict';
import { productionCandidates, parseCommercialCopy } from '../src/lib/factory-production-rules.ts';

test('produção automática só pega autorizados: reservar na triagem não produz', () => {
  const candidates = [{id:'raw',status:'CANDIDATO'}, {id:'reserved',status:'TRIADO'}, {id:'authorized',status:'APROVADO'}, {id:'done',status:'APROVADO'}];
  assert.deepEqual(productionCandidates(candidates, [{candidateId:'done',status:'PRONTO'}]).map(item => item.id), ['authorized']);
});

test('texto comercial não consegue sobrescrever peso, dimensão ou schema técnico', () => {
  const copy = parseCommercialCopy(JSON.stringify({title:'Óculos',shortDescription:'Armação preta',longDescription:'Armação preta conforme ficha do fornecedor.',bullets:[],benefits:[],tags:[],weightGrams:999,spec:{materials:['inventado']}}));
  assert.equal(Object.hasOwn(copy,'weightGrams'), false);
  assert.equal(Object.hasOwn(copy,'spec'), false);
  assert.equal(copy.universalTitle,'Óculos');
  assert.throws(() => parseCommercialCopy('{"title":"inventado"}'), /inválido/);
  assert.throws(() => parseCommercialCopy('Não há produto.'), SyntaxError);
});
