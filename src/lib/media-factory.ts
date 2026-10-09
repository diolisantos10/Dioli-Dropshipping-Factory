export type MediaKind = 'ORIGINAL' | 'DERIVADA';
export type MediaStatus = 'EM_REVISAO' | 'APROVADA' | 'REJEITADA';
export type MediaFormat = 'ORIGINAL' | 'JPEG' | 'PNG' | 'WEBP' | 'AVIF' | 'MP4' | 'WEBM';
export type MediaAspectRatio = 'ORIGINAL' | '1:1' | '4:5' | '9:16' | '16:9';
export type RightsStatus = 'DECLARADO' | 'LICENCIADO' | 'EXPIRADO' | 'DESCONHECIDO';
export type TransformationKind = 'REDIMENSIONAR' | 'REENQUADRAR' | 'CONVERTER' | 'OTIMIZAR';
export type TransformationJobStatus = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'FALHOU' | 'BLOQUEADO';

export type MediaAsset = {
  id: string; productId: string; url: string; sourceUrl?: string; kind: MediaKind; purpose: string; provenance: string;
  status: MediaStatus; createdAt: string; checksum?: string; mimeType?: string; bytes?: number;
  version?: number; originalAssetId?: string; destination?: string; format?: MediaFormat;
  aspectRatio?: MediaAspectRatio; rightsStatus?: RightsStatus; rightsHolder?: string;
  rightsExpiresAt?: string; transformationNotes?: string; changesProductAppearance?: boolean;
  studio?: boolean; studioAngle?: string; sourceAssetIds?: string[]; fidelityVerified?: boolean;
  fidelityEvidence?: string; generationProvider?: string; generationId?: string;
};
export type TransformationJob = {
  id: string; productId: string; sourceAssetId: string; kind: TransformationKind; destination: string;
  format: MediaFormat; aspectRatio: MediaAspectRatio; status: TransformationJobStatus; requestedAt: string;
  finishedAt?: string; derivedAssetId?: string; error?: string;
};
export type MediaState = { version: 1 | 2; assets: MediaAsset[]; jobs?: TransformationJob[] };
export const MEDIA_STORAGE_KEY = 'ddf.media.demo.v1';
export const emptyMedia: MediaState = { version: 2, assets: [], jobs: [] };

function validateRights(input: Pick<MediaAsset, 'rightsStatus' | 'rightsHolder' | 'rightsExpiresAt'>, at: string) {
  const status = input.rightsStatus ?? 'DECLARADO';
  if (status === 'LICENCIADO' && !input.rightsHolder?.trim()) throw new Error('Informe o titular da licença.');
  if (input.rightsExpiresAt && Number.isNaN(Date.parse(input.rightsExpiresAt))) throw new Error('Validade dos direitos inválida.');
  if (input.rightsExpiresAt && Date.parse(input.rightsExpiresAt) <= Date.parse(at)) throw new Error('Os direitos de uso já expiraram.');
}

export function addMedia(state: MediaState, input: Omit<MediaAsset, 'id'|'status'|'createdAt'>, id: string, at: string): MediaState {
  const url = new URL(input.url.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Informe uma URL HTTP ou HTTPS válida.');
  if (!input.purpose.trim() || !input.provenance.trim()) throw new Error('Finalidade e proveniência são obrigatórias.');
  validateRights(input, at);
  if (input.kind === 'DERIVADA') {
    const original = state.assets.find(asset => asset.id === input.originalAssetId && asset.kind === 'ORIGINAL' && asset.productId === input.productId);
    if (!original) throw new Error('Uma mídia derivada precisa apontar para um original do mesmo produto.');
    if (!input.transformationNotes?.trim()) throw new Error('Descreva as transformações realizadas.');
  }
  const purpose = input.purpose.trim();
  const latestVersion = Math.max(0, ...state.assets.filter(asset => asset.productId === input.productId && asset.purpose === purpose).map(asset => asset.version ?? 1));
  const asset: MediaAsset = { ...input, id, url: url.href, purpose, provenance: input.provenance.trim(), rightsHolder: input.rightsHolder?.trim(), destination: input.destination?.trim() || 'Universal', format: input.format ?? 'ORIGINAL', aspectRatio: input.aspectRatio ?? 'ORIGINAL', rightsStatus: input.rightsStatus ?? 'DECLARADO', transformationNotes: input.transformationNotes?.trim(), version: latestVersion + 1, status: 'EM_REVISAO', createdAt: at };
  return { ...state, version: 2, assets: [asset, ...state.assets], jobs: state.jobs ?? [] };
}

export function reviewMedia(state: MediaState, id: string, status: 'APROVADA'|'REJEITADA'): MediaState {
  const asset = state.assets.find(a => a.id === id);
  if (!asset || asset.status !== 'EM_REVISAO') throw new Error('Esta mídia já foi revisada ou não existe.');
  if (status === 'APROVADA') {
    if ((asset.rightsStatus ?? 'DESCONHECIDO') === 'DESCONHECIDO' || asset.rightsStatus === 'EXPIRADO') throw new Error('Não é possível aprovar mídia sem direitos de uso válidos.');
    if (asset.changesProductAppearance) throw new Error('Derivada bloqueada: a transformação pode alterar de forma enganosa a aparência do produto.');
    if (asset.studio && (!asset.fidelityVerified || !asset.fidelityEvidence?.trim() || !asset.studioAngle?.trim())) throw new Error('Foto de estúdio exige ângulo e verificação de fidelidade documentada.');
    if (asset.kind === 'DERIVADA') {
      const original = state.assets.find(item => item.id === asset.originalAssetId);
      if (!original || original.status !== 'APROVADA') throw new Error('A mídia original precisa estar aprovada antes da derivada.');
    }
  }
  return { ...state, assets: state.assets.map(a => a.id === id ? { ...a, status } : a) };
}

export function enqueueTransformation(state: MediaState, input: Omit<TransformationJob, 'status' | 'requestedAt'>, at: string): MediaState {
  const source = state.assets.find(asset => asset.id === input.sourceAssetId && asset.productId === input.productId);
  if (!source || source.kind !== 'ORIGINAL') throw new Error('Selecione uma mídia original válida.');
  if (source.status !== 'APROVADA') throw new Error('A transformação só pode partir de um original aprovado.');
  if (!input.destination.trim()) throw new Error('Informe o destino da transformação.');
  if ((state.jobs ?? []).some(job => job.sourceAssetId === input.sourceAssetId && job.destination === input.destination.trim() && job.format === input.format && job.aspectRatio === input.aspectRatio && ['PENDENTE', 'PROCESSANDO'].includes(job.status))) throw new Error('Já existe um job equivalente em andamento.');
  const job: TransformationJob = { ...input, destination: input.destination.trim(), status: 'PENDENTE', requestedAt: at };
  return { ...state, version: 2, jobs: [job, ...(state.jobs ?? [])] };
}

export function updateTransformationJob(state: MediaState, id: string, status: 'PROCESSANDO' | 'FALHOU' | 'BLOQUEADO', at: string, error?: string): MediaState {
  const job = (state.jobs ?? []).find(item => item.id === id);
  if (!job || (job.status !== 'PENDENTE' && !(job.status === 'PROCESSANDO' && status === 'FALHOU'))) throw new Error('Transição de job inválida.');
  if ((status === 'FALHOU' || status === 'BLOQUEADO') && !error?.trim()) throw new Error('Informe o motivo da falha ou bloqueio.');
  return { ...state, jobs: (state.jobs ?? []).map(item => item.id === id ? { ...item, status, finishedAt: status === 'PROCESSANDO' ? undefined : at, error: error?.trim() } : item) };
}

export function completeTransformation(state: MediaState, jobId: string, derived: Omit<MediaAsset, 'id'|'status'|'createdAt'|'kind'|'productId'|'originalAssetId'|'destination'|'format'|'aspectRatio'>, assetId: string, at: string): MediaState {
  const job = (state.jobs ?? []).find(item => item.id === jobId);
  if (!job || !['PENDENTE', 'PROCESSANDO'].includes(job.status)) throw new Error('Job não está disponível para conclusão.');
  let next = addMedia(state, { ...derived, productId: job.productId, kind: 'DERIVADA', originalAssetId: job.sourceAssetId, destination: job.destination, format: job.format, aspectRatio: job.aspectRatio }, assetId, at);
  next = { ...next, jobs: (next.jobs ?? []).map(item => item.id === jobId ? { ...item, status: derived.changesProductAppearance ? 'BLOQUEADO' : 'CONCLUIDO', finishedAt: at, derivedAssetId: assetId, error: derived.changesProductAppearance ? 'Possível alteração enganosa da aparência.' : undefined } : item) };
  return next;
}

export const hasApprovedMedia = (state: MediaState, productId: string) => state.assets.some(a => a.productId === productId && a.status === 'APROVADA');

/** Originals remain archived; only faithful, distinct studio views enter the commercial catalog. */
export function approvedStudioMedia(assets: MediaAsset[], productId: string): MediaAsset[] {
  const urls = new Set<string>(); const angles = new Set<string>();
  return assets.filter(asset => {
    if (asset.productId !== productId || asset.kind !== 'DERIVADA' || !asset.studio || asset.status !== 'APROVADA' ||
      !asset.fidelityVerified || !asset.fidelityEvidence?.trim() || asset.changesProductAppearance || !asset.studioAngle?.trim() ||
      (asset.mimeType ?? '').startsWith('video/')) return false;
    const references = asset.sourceAssetIds?.length ? asset.sourceAssetIds : [asset.originalAssetId];
    if (!references.every(id => assets.some(original => original.id === id && original.productId === productId && original.kind === 'ORIGINAL' && original.status === 'APROVADA')) || !references.length) return false;
    if (assets.some(original => original.kind === 'ORIGINAL' && (original.url === asset.url || original.sourceUrl === asset.url))) return false;
    const angle = asset.studioAngle.trim().toLowerCase();
    if (urls.has(asset.url) || angles.has(angle)) return false;
    urls.add(asset.url); angles.add(angle); return true;
  });
}
export const approvedStudioAssets = (state: MediaState, productId: string) => approvedStudioMedia(state.assets, productId);
export function studioReadiness(state: MediaState, productId: string, requiredCount = 4) {
  const assets = approvedStudioAssets(state, productId);
  const minimum = Math.max(4, requiredCount);
  return { ready: assets.length >= minimum, approvedCount: assets.length, requiredCount: minimum,
    missingAngles: Math.max(0, minimum - assets.length),
    reasons: assets.length >= minimum ? [] : [`Fotos de estúdio aprovadas: ${assets.length}/${minimum}. Originais e ângulos duplicados não contam.`] };
}
export const hasApprovedStudioMedia = (state: MediaState, productId: string) => studioReadiness(state, productId).ready;

export function ingestSupplierOriginals(state: MediaState, productId: string, urls: string[], provenance: string, at: string): MediaState {
  let next = state;
  for (const url of [...new Set(urls)]) {
    if (next.assets.some(asset => asset.productId === productId && asset.kind === 'ORIGINAL' && (asset.url === url || asset.sourceUrl === url))) continue;
    let index = next.assets.filter(asset => asset.productId === productId && asset.kind === 'ORIGINAL').length + 1;
    while (next.assets.some(asset => asset.id === `${productId}-original-${index}`)) index++;
    next = addMedia(next, { productId, url, kind: 'ORIGINAL', purpose: `Referência fornecedor ${index}`, provenance,
      rightsStatus: 'DECLARADO', destination: 'Arquivo de originais' }, `${productId}-original-${index}`, at);
    // Acquisition was authorized at production approval; originals stay separate from commercial images.
    next = reviewMedia(next, next.assets[0].id, 'APROVADA');
  }
  return next;
}
