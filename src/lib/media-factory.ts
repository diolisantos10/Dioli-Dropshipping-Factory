export type MediaKind = 'ORIGINAL' | 'DERIVADA';
export type MediaStatus = 'EM_REVISAO' | 'APROVADA' | 'REJEITADA';
export type MediaAsset = { id: string; productId: string; url: string; kind: MediaKind; purpose: string; provenance: string; status: MediaStatus; createdAt: string; checksum?: string; mimeType?: string; bytes?: number };
export type MediaState = { version: 1; assets: MediaAsset[] };
export const MEDIA_STORAGE_KEY = 'ddf.media.demo.v1';
export const emptyMedia: MediaState = { version: 1, assets: [] };
export function addMedia(state: MediaState, input: Omit<MediaAsset, 'id'|'status'|'createdAt'>, id: string, at: string): MediaState {
  const url = new URL(input.url.trim()); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Informe uma URL HTTP ou HTTPS válida.');
  if (!input.purpose.trim() || !input.provenance.trim()) throw new Error('Finalidade e proveniência são obrigatórias.');
  return { ...state, assets: [{ ...input, id, url: url.href, purpose: input.purpose.trim(), provenance: input.provenance.trim(), status: 'EM_REVISAO', createdAt: at }, ...state.assets] };
}
export function reviewMedia(state: MediaState, id: string, status: 'APROVADA'|'REJEITADA'): MediaState {
  const asset = state.assets.find(a => a.id === id); if (!asset || asset.status !== 'EM_REVISAO') throw new Error('Esta mídia já foi revisada ou não existe.');
  return { ...state, assets: state.assets.map(a => a.id === id ? { ...a, status } : a) };
}
export const hasApprovedMedia = (state: MediaState, productId: string) => state.assets.some(a => a.productId === productId && a.status === 'APROVADA');
