import type { MediaState } from './media-factory';

/** Read-only, bounded telemetry from an already saved studio result. Never calls a model or retries production. */
export function storedStudioOutcome(media: MediaState, productId: string) {
  const request = media.productionRequests?.find(item => item.productId === productId);
  const derived = (media.assets ?? []).filter(item => item.productId === productId && item.kind === 'DERIVADA' && item.studio === true);
  const latest = [...derived].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const evidence = (latest?.fidelityEvidence ?? '').slice(0, 10_000);
  return {
    storedStudioGeneratedCount: derived.length,
    storedStudioRejectedCount: derived.filter(item => item.status === 'REJEITADA').length,
    storedStudioApprovedCount: derived.filter(item => item.status === 'APROVADA' && item.fidelityVerified === true).length,
    storedStudioRequestBlocked: request?.status === 'BLOQUEADO',
    storedStudioLatestRejected: latest?.status === 'REJEITADA',
    storedStudioFinalEvidenceAvailable: !!evidence.trim(),
    // Mentions are evidence-location hints, never inferred failure decisions.
    finalEvidenceMentions: {
      geometry: /geometr|formato|propor[cç]|shape|dimensions?|deform|hastes?|lentes?|temples?|lens/i.test(evidence),
      variant: /variant|cor(es)?|color/i.test(evidence),
      angle: /[aâ]ngulo|angle|frontal|lateral|posterior|front/i.test(evidence),
      background: /fundo|background/i.test(evidence),
      square: /quadrad|square|1:1/i.test(evidence),
      people: /pessoa|modelo|m[aã]o|people|person|hand/i.test(evidence),
      realism: /realism|realista|render|artificial/i.test(evidence),
      unavailableImage: /n[aã]o (?:consigo|pude|posso) (?:visualizar|acessar|ver)|(?:cannot|unable to) (?:see|view|access)|not (?:provided|loaded)|indispon[ií]vel/i.test(evidence),
    },
  };
}
