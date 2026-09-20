import test from 'node:test'; import assert from 'node:assert/strict';
import { addMedia, emptyMedia, hasApprovedMedia, reviewMedia } from '../src/lib/media-factory.ts';
test('mídia exige origem e revisão explícita', () => {
  assert.throws(() => addMedia(emptyMedia, { productId: 'p1', url: 'javascript:x', kind: 'ORIGINAL', purpose: 'Principal', provenance: 'Fonte' }, 'm1', 'now'));
  let state = addMedia(emptyMedia, { productId: 'p1', url: 'https://example.com/image.jpg', kind: 'ORIGINAL', purpose: 'Principal', provenance: 'Fornecedor controlado' }, 'm1', 'now');
  assert.equal(hasApprovedMedia(state, 'p1'), false); state = reviewMedia(state, 'm1', 'APROVADA'); assert.equal(hasApprovedMedia(state, 'p1'), true);
});
