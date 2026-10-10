// Server-only transport for the central Control Room. Supplier/provider keys never live in DDF.
// Contract verified against control_room main: ai-runtime/interfaces/http.ts and adapters/tipos.ts.
export const GATEWAY_CAPABILITIES = Object.freeze({
  text: true, imageGeneration: true, referenceImages: true, imageEditing: true, vision: true,
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

type WorkClass = 'routine' | 'technical_execution' | 'source_grounded_research' | 'creative_multimodal' | 'image_editing' | 'visual_review';
export type GatewayTextRequest = {
  roleAddress: string;
  system: string;
  prompt: string;
  payloadRef: string;
  correlationId?: string;
  maxTokens?: number;
  timeoutMs?: number;
  workClass?: WorkClass;
  referenceImages?: string[];
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

export const MAX_INLINE_REFERENCE = 14_000_000;
export function validGatewayReference(raw: string) {
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw)) return raw.length <= MAX_INLINE_REFERENCE;
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password && raw.length <= 4096; } catch { return false; }
}

async function executeGateway(request: GatewayTextRequest, image = false) {
  const config = configuration();
  if (!/^dioli\.[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(request.roleAddress) || !request.payloadRef.trim() || !request.system.trim() || !request.prompt.trim()) {
    throw new GatewayError('gateway_invalid_request', 'Papel, referência e mensagens são obrigatórios e precisam ser válidos.');
  }
  const maxTokens = request.maxTokens ?? 4096;
  const referenceImages = request.referenceImages ?? [];
  if (referenceImages.length > 16 || referenceImages.some(raw => !validGatewayReference(raw)) || referenceImages.reduce((sum, raw) => sum + raw.length, 0) > 24_000_000) throw new GatewayError('gateway_invalid_request', 'Referências de imagem inválidas ou acima do limite.');
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32_000) throw new GatewayError('gateway_invalid_request', 'Limite de tokens inválido.');
  const timeoutMs = request.timeoutMs ?? (image ? 200_000 : 90_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 200_000) throw new GatewayError('gateway_invalid_request', 'Timeout do gateway inválido.');
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: 'POST', cache: 'no-store',
      headers: { 'content-type': 'application/json', 'X-Service-Token': config.token },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        roleAddress: request.roleAddress, workClass: request.workClass ?? (image ? 'image_editing' : 'technical_execution'), modalidade: image ? 'image' : referenceImages.length ? 'vision' : 'text',
        centroCustoId: config.costCenterId,
        escopo: { holdingId: config.holdingId, productId: process.env.CONTROL_ROOM_PRODUCT_ID ?? 'ddf', roleAddress: request.roleAddress },
        ambiente: config.environment, payloadRef: request.payloadRef, classificacaoDados: 'internal', solicitadoPor: 'ddf-automation',
        correlacaoId: request.correlationId,
        ...(image ? { prompt: `${request.system}\n${request.prompt}`, n: 1 } : { mensagens: [{ role: 'system', content: request.system }, { role: 'user', content: request.prompt }], maxTokens }),
        ...(referenceImages.length ? { imagensReferencia: referenceImages } : {}),
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
    const providerFailures: Record<string, string> = { schema_invalido: 'invalid_request', indisponivel: 'unavailable', timeout: 'timeout', politica_provedor: 'access_denied', orcamento_provedor_excedido: 'budget_exceeded' };
    const providerFailure = typeof result.erroNormalizado === 'string' ? providerFailures[result.erroNormalizado] : undefined;
    const upstreamStatus = typeof result.motivo === 'string' ? result.motivo.match(/^(?:OpenAI|xAI) respondeu HTTP (\d{3})\.$/)?.[1] : undefined;
    const providerCodes = ['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded', 'rate_limit_exceeded', 'slow_down', 'invalid_api_key', 'model_not_found', 'model_access_denied', 'invalid_image_url', 'invalid_image', 'unsupported_parameter', 'billing_hard_limit_reached', 'organization_deactivated', 'content_policy_violation'];
    const providerCode = typeof result.codigoDoProvedor === 'string' && providerCodes.includes(result.codigoDoProvedor) ? result.codigoDoProvedor : undefined;
    const code = response.status === 401 ? 'gateway_pairing_required' : response.status === 409 ? 'gateway_policy_blocked'
      : response.status === 502 && providerFailure ? `gateway_provider_${providerFailure}${upstreamStatus ? `_http_${upstreamStatus}` : ''}${providerCode ? `_${providerCode}` : ''}`
      : response.status === 422 ? 'gateway_contract_rejected' : 'gateway_execution_failed';
    throw new GatewayError(code, providerCode === 'credit_balance_exhausted' ? 'A OpenAI informou saldo pré-pago esgotado na organização associada à chave do cofre central. Confira o crédito nessa mesma organização.'
      : providerCode && ['organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'].includes(providerCode) ? 'A OpenAI bloqueou a execução por limite de gastos ou uso da organização/projeto associado ao cofre central.'
      : response.status === 401 ? 'Pareamento da DDF não autorizado na Control Room.'
      : response.status === 409 ? 'Execução bloqueada por perfil, política ou orçamento da Control Room.'
      : 'A Control Room recusou ou não concluiu a execução de IA.', response.status >= 500 || result.tentavelDeNovo === true);
  }
  return { body, result };
}

export async function generateGatewayText(request: GatewayTextRequest): Promise<GatewayTextResult> {
  const { body, result } = await executeGateway(request);
  if (typeof result.conteudo !== 'string' || !result.conteudo.trim() || typeof body.provedorId !== 'string'
    || typeof body.modeloId !== 'string' || !['primario', 'fallback'].includes(String(body.tier))) {
    throw new GatewayError('gateway_invalid_response', 'A Control Room devolveu uma resposta incompatível com o contrato de texto.');
  }
  const provenance = result.proveniencia && typeof result.proveniencia === 'object' ? result.proveniencia as Record<string, unknown> : {};
  return { text: result.conteudo, providerId: body.provedorId, modelId: body.modeloId,
    tier: body.tier as 'primario' | 'fallback',
    provenance: Object.fromEntries(Object.entries(provenance).filter(([key]) => !/credential|token|secret|key/i.test(key))) };
}

export type GatewayImageResult = { base64: string; mimeType: 'image/png' | 'image/jpeg'; providerId: string; modelId: string; generationId: string };
export async function generateGatewayImage(request: GatewayTextRequest): Promise<GatewayImageResult> {
  if (!request.referenceImages?.length) throw new GatewayError('gateway_invalid_request', 'Foto comercial exige referências originais.');
  const { body, result } = await executeGateway(request, true);
  const images = result.conteudo;
  const first = Array.isArray(images) && images.length === 1 ? images[0] : null;
  if (!first || typeof first.b64_json !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(first.b64_json) || first.b64_json.length > 13_333_336
    || typeof body.provedorId !== 'string' || typeof body.modeloId !== 'string') throw new GatewayError('gateway_invalid_response', 'Gateway não devolveu uma imagem raster válida no limite de 10 MB.');
  const bytes = Buffer.from(first.b64_json, 'base64');
  const mimeType = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217 ? 'image/jpeg' : null;
  if (!mimeType) throw new GatewayError('gateway_invalid_response', 'Imagem devolvida não é PNG ou JPEG.');
  const provenance = result.proveniencia && typeof result.proveniencia === 'object' ? result.proveniencia as Record<string, unknown> : {};
  return { base64: first.b64_json, mimeType, providerId: body.provedorId, modelId: body.modeloId,
    generationId: typeof provenance.request_id === 'string' ? provenance.request_id : 'central-gateway' };
}
