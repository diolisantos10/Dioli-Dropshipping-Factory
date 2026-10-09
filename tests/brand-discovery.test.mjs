import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialBrandBriefs, validateBrandBrief, discoveryQuery, discoveryEvidence, dayInBrazil, excludedDiscoveryTitle } from '../src/lib/brand-discovery-rules.ts';
import { addCandidate, emptyIntake } from '../src/lib/intake.ts';
test('each brand has an editable briefing and bounded queries without copying reference brands', () => {
  assert.deepEqual(initialBrandBriefs.map(brief => brief.key).sort(), ['dilly', 'santioh']);
  for (const brief of initialBrandBriefs) {
    assert.equal(validateBrandBrief(brief).key, brief.key);
    assert.equal(brief.enabled, true);
    assert.ok(brief.dailyLimit <= 30);
    assert.ok(!/zara|loewe|rimowa/i.test(brief.queries.join(' ')));
    assert.equal(discoveryQuery(brief, brief.queries.length), brief.queries[0]);
  }
});
test('malformed and unbounded briefing values are rejected', () => {
  const brief = initialBrandBriefs[0];
  for (const patch of [{ dailyLimit: 1000 }, { dailyLimit: 0 }, { queries: [] }, { queries: ['x'.repeat(121)] }, { enabled: 'yes' }, { criteria: null }]) assert.throws(() => validateBrandBrief({ ...brief, ...patch }));
});
test('discovery preserves brand provenance and never approves a candidate', () => {
  const brief = initialBrandBriefs[0];
  const state = addCandidate(emptyIntake, { name: 'Óculos', url: 'https://www.aliexpress.com/item/123456789.html', notes: 'Busca automática', source: 'TREND', evidence: discoveryEvidence(brief, brief.queries[0]) }, 'raw-auto', '2026-10-09T12:00:00Z', 'system:brand-discovery');
  assert.equal(state.candidates[0].status, 'CANDIDATO');
  assert.ok(state.candidates[0].evidence.includes('brand:santioh'));
  assert.ok(state.candidates[0].evidence.includes('engine:aliexpress-api-rules'));
});
test('daily cap resets by Brazil date, and explicit replicas are excluded', () => {
  assert.equal(dayInBrazil(new Date('2026-10-10T01:00:00Z')), '2026-10-09');
  assert.equal(excludedDiscoveryTitle('1:1 copy designer sunglasses'), true);
  assert.equal(excludedDiscoveryTitle('Geometric sunglasses'), false);
});
test('AI curation accepts only real supplier references within cap', async () => {
  const { parseDiscoveryShortlist } = await import('../src/lib/brand-discovery-rules.ts');
  assert.deepEqual(parseDiscoveryShortlist('```json\n{"itemIds":["123","123"]}\n```', ['123', '456'], 2), ['123']);
  assert.deepEqual(parseDiscoveryShortlist('{"itemIds":[]}', ['123'], 2), []);
  assert.throws(() => parseDiscoveryShortlist('{"itemIds":["invented"]}', ['123'], 2));
  assert.throws(() => parseDiscoveryShortlist('{"itemIds":["123","456"]}', ['123', '456'], 1));
});
