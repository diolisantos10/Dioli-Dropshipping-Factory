import test from 'node:test';
import assert from 'node:assert/strict';
import { storedStudioOutcome } from '../src/lib/studio-outcome-diagnostic.ts';
test('saved rejection is distinguished from missing references without leaking evidence, IDs or provider data', () => {
  const media = { assets: [
    { id: 'private-asset', productId: 'pilot', kind: 'DERIVADA', studio: true, status: 'REJEITADA', createdAt: '2026-10-12T03:21:00Z', fidelityEvidence: 'Geometria da haste alterada. private-secret https://private.example/photo', generationId: 'private-generation' },
    { productId: 'other', kind: 'DERIVADA', studio: true, status: 'APROVADA', createdAt: '2026-10-12T03:22:00Z', fidelityVerified: true },
    { productId: 'pilot', kind: 'ORIGINAL', status: 'APROVADA' },
  ], productionRequests: [{ productId: 'pilot', status: 'BLOQUEADO' }] };
  const before = JSON.stringify(media);
  const result = storedStudioOutcome(media, 'pilot');
  assert.equal(result.storedStudioGeneratedCount, 1);
  assert.equal(result.storedStudioRejectedCount, 1);
  assert.equal(result.storedStudioApprovedCount, 0);
  assert.equal(result.storedStudioLatestRejected, true);
  assert.equal(result.finalEvidenceMentions.geometry, true);
  assert.equal(result.finalEvidenceMentions.background, false);
  assert.doesNotMatch(JSON.stringify(result), /private|https:|generation/);
  assert.equal(JSON.stringify(media), before);
});
test('no saved output is not claimed as generated and a mention is never called a failed criterion', () => {
  const empty = storedStudioOutcome({ assets: [] }, 'pilot');
  assert.equal(empty.storedStudioGeneratedCount, 0);
  assert.equal(empty.storedStudioFinalEvidenceAvailable, false);
  const reviewed = storedStudioOutcome({ assets: [{ productId: 'pilot', kind: 'DERIVADA', studio: true, status: 'APROVADA', createdAt: '2026-10-12T00:00:00Z', fidelityVerified: true, fidelityEvidence: 'Geometria preservada, fundo branco.' }] }, 'pilot');
  assert.equal(reviewed.storedStudioApprovedCount, 1);
  assert.equal(reviewed.storedStudioLatestRejected, false);
  assert.equal(reviewed.finalEvidenceMentions.geometry, true);
  assert.equal('failedConditions' in reviewed, false);
});
