import { addMedia, reviewMedia, approvedStudioAssets, type MediaAsset, type MediaState } from './media-factory.ts';

export type StudioRequest = {
  productId: string; title: string; technicalDescription: string;
  references: { assetId: string; url: string }[]; minimumImages: number; instructions: string;
};
export type StudioOutput = {
  url: string; angle: string; sourceAssetIds: string[]; fidelityVerified: boolean;
  fidelityEvidence: string; neutralBackground: boolean; mimeType: string;
  generationId: string;
};
/** Implemented by the authenticated central AI gateway, never by substituting supplier URLs. */
export type StudioProvider = { name: string; generateStudio: (request: StudioRequest) => Promise<StudioOutput[]> };
export const STUDIO_INSTRUCTIONS = 'Analise todas as fotografias originais e a ficha técnica. Produza pelo menos quatro fotografias de estúdio hiper-realistas em fundo neutro, nítidas e de alta qualidade, em ângulos distintos e complementares. Preserve exatamente forma, cor, textura, material, proporções, logotipos e detalhes do produto e da variante. Mostre somente ângulos comprovados pelas referências. Não invente partes ocultas nem transforme um ângulo duplicado em vista nova. Se as referências forem insuficientes, devolva bloqueio com o motivo. Verifique fidelidade de cada saída contra as referências e documente a evidência.';

export async function generateStudioPack(state: MediaState, input: { productId: string; title: string; technicalDescription: string; minimumImages?: number }, provider: StudioProvider | null, at: string): Promise<MediaState> {
  const minimumImages = Math.max(4, input.minimumImages ?? 4);
  if (approvedStudioAssets(state, input.productId).length >= minimumImages) return state;
  if (!provider) throw new Error('Geração de estúdio bloqueada: gateway de IA central não configurado com geração e validação de imagens.');
  const originals = state.assets.filter(asset => asset.productId === input.productId && asset.kind === 'ORIGINAL' && asset.status === 'APROVADA' && !(asset.mimeType ?? '').startsWith('video/'));
  if (!originals.length) throw new Error('Geração de estúdio bloqueada: faltam referências originais do fornecedor.');
  const outputs = await provider.generateStudio({ ...input, minimumImages, references: originals.map(asset => ({ assetId: asset.id, url: asset.url })), instructions: STUDIO_INSTRUCTIONS });
  if (!Array.isArray(outputs) || outputs.length < minimumImages) throw new Error(`O gateway precisa entregar pelo menos ${minimumImages} imagens de estúdio verificadas.`);
  const angles = new Set<string>(); const urls = new Set<string>();
  // Validate the entire pack before writing any generated asset.
  for (const output of outputs) {
    const url = new URL(output.url);
    if (url.protocol !== 'https:' || url.username || url.password || !output.mimeType?.startsWith('image/')) throw new Error('Saída de estúdio inválida: exige imagem HTTPS.');
    if (!output.neutralBackground || !output.fidelityVerified || !output.fidelityEvidence?.trim() || !output.generationId?.trim()) throw new Error('Geração bloqueada: fundo neutro e fidelidade não foram comprovados.');
    const angle = output.angle?.trim().toLowerCase();
    if (!angle || angles.has(angle) || urls.has(output.url) || originals.some(asset => asset.url === output.url)) throw new Error('Geração bloqueada: ângulo duplicado ou original apresentado como foto gerada.');
    if (!output.sourceAssetIds?.length || !output.sourceAssetIds.every(id => originals.some(asset => asset.id === id))) throw new Error('Geração bloqueada: faltam referências válidas para verificar o ângulo.');
    angles.add(angle); urls.add(output.url);
  }
  let next = state;
  for (const [index, output] of outputs.entries()) {
    const asset: Omit<MediaAsset, 'id' | 'status' | 'createdAt'> = {
      productId: input.productId, url: output.url, kind: 'DERIVADA', purpose: `Estúdio · ${output.angle}`, provenance: `${provider.name} · ${output.generationId}`,
      originalAssetId: output.sourceAssetIds[0], sourceAssetIds: output.sourceAssetIds, destination: 'Catálogo comercial', format: output.mimeType === 'image/jpeg' ? 'JPEG' : output.mimeType === 'image/webp' ? 'WEBP' : output.mimeType === 'image/avif' ? 'AVIF' : 'PNG', aspectRatio: '1:1',
      rightsStatus: 'DECLARADO', mimeType: output.mimeType, studio: true, studioAngle: output.angle, fidelityVerified: true, fidelityEvidence: output.fidelityEvidence,
      generationProvider: provider.name, generationId: output.generationId, changesProductAppearance: false, transformationNotes: output.fidelityEvidence,
    };
    const id = `${input.productId}-studio-${output.generationId}-${index + 1}`;
    next = reviewMedia(addMedia(next, asset, id, at), id, 'APROVADA');
  }
  return next;
}
