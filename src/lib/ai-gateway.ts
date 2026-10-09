// Server-only transport for the central Control Room. Supplier/provider keys never live in DDF.
// Contract verified against control_room main: ai-runtime/interfaces/http.ts and adapters/tipos.ts.
export const GATEWAY_CAPABILITIES = Object.freeze({
  text: true, imageGeneration: true, referenceImages: false, imageEditing: false, vision: false,
});

export class GatewayError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    this.retryable = retryable;
  }
}

type WorkClass = 'routine' | 'technical_execution' | 'source_grounded_research' | 'creative_multimodal';
export type GatewayTextRequest = {
  roleAddress: string;
  system: string;
  prompt: string;
  payloadRef: string;
  correlationId?: string;
  maxTokens?: number;
  workClass?: WorkClass;
};
export type GatewayTextResult = {
  text: string;
  providerId: string;
  modelId: string;
  tier: 'primario' | 'fallback';
  provenance: Record<string, unknown>;
};

function configuration() {
  if (typeof window !== 'undefined') throw new GatewayError('server_only', 'O gateway de IA só pode ser chamado no servidor.');
  const rawUrl = process.env.CONTROL_ROOM_GATEWAY_URL?.trim();
  const token = process.env.CONTROL_ROOM_SERVICE_TOKEN?.trim();
  const costCenterId = process.env.CONTROL_ROOM_COST_CENTER_ID?.trim();
  const holdingId = process.env.CONTROL_ROOM_HOLDING_ID?.trim();
  if (!rawUrl || !token || !costCenterId || !holdingId) {
    throw new GatewayError('gateway_not_configured', 'Pareamento, endereço, holding e centro de custo da Control Room ainda não configurados.');
  }
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new GatewayError('gateway_invalid_configuration', 'Endereço do gateway inválido.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new GatewayError('gateway_invalid_configuration', 'O gateway exige endereço HTTPS sem credenciais, parâmetros ou fragmentos.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(costCenterId)) {
    throw new GatewayError('gateway_invalid_configuration', 'Centro de custo do gateway deve ser um UUID válido.');
  }
  const environment = process.env.CONTROL_ROOM_ENVIRONMENT ?? 'production';
  if (!['development', 'test', 'homologation', 'production'].includes(environment)) {
    throw new GatewayError('gateway_invalid_configuration', 'Ambiente do gateway inválido.');
  }
  const path = '/api/v1/ai/gateway/execute';
  url.pathname = url.pathname.endsWith(path) ? url.pathname : `${url.pathname.replace(/\/$/, '')}${path}`;
  return { url: url.toString(), token, costCenterId, holdingId, environment };
}

export function gatewayConfigurationStatus() {
  try { configuration(); return { configured: true, code: null, message: null }; }
  catch (error) {
    return { configured: false, code: error instanceof GatewayError ? error.code : 'gateway_invalid_configuration',
      message: error instanceof GatewayError ? error.message : 'Configuração do gateway inválida.' };
  }
}

export async function generateGatewayText(request: GatewayTextRequest): Promise<GatewayTextResult> {
  const config = configuration();
  if (!/^dioli\.[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(request.roleAddress) || !request.payloadRef.trim() || !request.system.trim() || !request.prompt.trim()) {
    throw new GatewayError('gateway_invalid_request', 'Papel, referência e mensagens são obrigatórios e precisam ser válidos.');
  }
  const maxTokens = request.maxTokens ?? 4096;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32_000) throw new GatewayError('gateway_invalid_request', 'Limite de tokens inválido.');
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: 'POST', cache: 'no-store',
      headers: { 'content-type': 'application/json', 'X-Service-Token': config.token },
      signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({
        roleAddress: request.roleAddress, workClass: request.workClass ?? 'technical_execution', modalidade: 'text',
        centroCustoId: config.costCenterId,
        escopo: { holdingId: config.holdingId, productId: process.env.CONTROL_ROOM_PRODUCT_ID ?? 'ddf', roleAddress: request.roleAddress },
        ambiente: config.environment, payloadRef: request.payloadRef, classificacaoDados: 'internal', solicitadoPor: 'ddf-automation',
        correlacaoId: request.correlationId,
        mensagens: [{ role: 'system', content: request.system }, { role: 'user', content: request.prompt }], maxTokens,
      }),
    });
  } catch {
    throw new GatewayError('gateway_unavailable', 'A Control Room não respondeu à execução de IA; nenhuma conclusão foi presumida.', true);
  }
  const data: unknown = await response.json().catch(() => null);
  const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const result = body.resultado && typeof body.resultado === 'object' ? body.resultado as Record<string, unknown> : {};
  if (!response.ok || body.ok !== true || result.sucesso !== true) {
    // Upstream errors can contain provider details. Expose a stable code, never the raw response or token.
    const code = response.status === 401 ? 'gateway_pairing_required' : response.status === 409 ? 'gateway_policy_blocked'
      : response.status === 422 ? 'gateway_contract_rejected' : 'gateway_execution_failed';
    throw new GatewayError(code, response.status === 401 ? 'Pareamento da DDF não autorizado na Control Room.'
      : response.status === 409 ? 'Execução bloqueada por perfil, política ou orçamento da Control Room.'
      : 'A Control Room recusou ou não concluiu a execução de IA.', response.status >= 500 || result.tentavelDeNovo === true);
  }
  if (typeof result.conteudo !== 'string' || !result.conteudo.trim() || typeof body.provedorId !== 'string'
    || typeof body.modeloId !== 'string' || !['primario', 'fallback'].includes(String(body.tier))) {
    throw new GatewayError('gateway_invalid_response', 'A Control Room devolveu uma resposta incompatível com o contrato de texto.');
  }
  const provenance = result.proveniencia && typeof result.proveniencia === 'object' ? result.proveniencia as Record<string, unknown> : {};
  return { text: result.conteudo, providerId: body.provedorId, modelId: body.modeloId,
    tier: body.tier as 'primario' | 'fallback',
    provenance: Object.fromEntries(Object.entries(provenance).filter(([key]) => !/credential|token|secret|key/i.test(key))) };
}
