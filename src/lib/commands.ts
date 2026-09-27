// Server-side command catalogue. Every mutation of the factory state is executed here, on the
// server, against the persisted state: the browser only sends intent (type + input) and never a
// computed payload. Identity, timestamps and IDs come from the server context, and cross-module
// rules (approved candidate, approved media, READY product, approver role) are enforced here.
import { addCandidate, bulkTransitionCandidates, emptyIntake, transitionCandidate, type CandidateSource, type CandidateStatus, type CandidateSupplier, type IntakeState } from './intake.ts';
import { emptyProductFactory, markProductReady, restoreProductVersion, startProduct, updateProduct, type ProductFactoryState, type UniversalProductSpec } from './product-factory.ts';
import { addMedia, completeTransformation, emptyMedia, enqueueTransformation, hasApprovedMedia, reviewMedia, updateTransformationJob, type MediaAsset, type MediaState, type TransformationJob } from './media-factory.ts';
import { approvePrice, calculatePrice, emptyPricing, recalculateSupplierCost, releaseQuarantine, type PricingInput, type PricingState } from './pricing.ts';
import { advanceOrder, emptyOrders, flagOrderException, purgeExpiredOrderData, receiveOrder, resolveOrderException, type ExceptionCategory, type ExceptionResolution, type OrderState, type OrderStatus } from './orders.ts';
import { addSupplierOffer, assignProduct, curateProducts, emptyCatalog, refreshSupplierOffer, upsertParty, type CatalogState } from './catalog.ts';

export type CommandNamespace = 'intake' | 'products' | 'media' | 'pricing' | 'orders' | 'catalog';
export type CommandRole = 'ADMIN' | 'APPROVER' | 'OPERATOR' | 'SYSTEM';
export type CommandContext = { actor: string; role: string; at: string; newId: () => string };
export type CommandStates = { intake: IntakeState; products: ProductFactoryState; media: MediaState; pricing: PricingState; orders: OrderState; catalog: CatalogState };
type Input = Record<string, unknown>;
type Handler = { writes: CommandNamespace; reads: CommandNamespace[]; roles: (input: Input) => CommandRole[]; run: (states: CommandStates, input: Input, ctx: CommandContext) => unknown };

export const emptyStates: CommandStates = { intake: emptyIntake, products: emptyProductFactory, media: emptyMedia, pricing: emptyPricing, orders: emptyOrders, catalog: emptyCatalog };
const OPERATE: CommandRole[] = ['ADMIN', 'APPROVER', 'OPERATOR'];
const APPROVE: CommandRole[] = ['ADMIN', 'APPROVER'];
const always = (roles: CommandRole[]) => () => roles;

export class CommandError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

function str(input: Input, key: string, max = 2000, required = true): string {
  const value = input[key];
  if (value === undefined || value === null || value === '') { if (required) throw new CommandError(`Campo obrigatório: ${key}.`); return ''; }
  if (typeof value !== 'string' || value.length > max) throw new CommandError(`Campo inválido: ${key}.`);
  return value;
}
function num(input: Input, key: string): number {
  const value = typeof input[key] === 'string' && input[key] !== '' ? Number(input[key]) : input[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new CommandError(`Número inválido: ${key}.`);
  return value;
}
function optionalNum(input: Input, key: string): number | undefined { return input[key] === undefined || input[key] === null || input[key] === '' ? undefined : num(input, key); }
function nullableInt(input: Input, key: string): number | null { const value = optionalNum(input, key); return value === undefined ? null : value; }
function strings(input: Input, key: string, maxItems = 200): string[] {
  const value = input[key] ?? [];
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== 'string' || item.length > 2000)) throw new CommandError(`Lista inválida: ${key}.`);
  return value as string[];
}
function obj(input: Input, key: string): Input {
  const value = input[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CommandError(`Objeto inválido: ${key}.`);
  return value as Input;
}
function oneOf<T extends string>(input: Input, key: string, values: readonly T[]): T {
  const value = str(input, key, 60);
  if (!(values as readonly string[]).includes(value)) throw new CommandError(`Valor inválido: ${key}.`);
  return value as T;
}
function readyProduct(states: CommandStates, productId: string) {
  const product = states.products.products.find((item) => item.id === productId);
  if (!product) throw new CommandError('Produto mestre não encontrado.', 404);
  if (product.status !== 'PRONTO') throw new CommandError('Somente produtos PRONTOS podem seguir para preço, catálogo e pedidos.');
  return product;
}
function productInProduction(states: CommandStates, productId: string) {
  const product = states.products.products.find((item) => item.id === productId);
  if (!product) throw new CommandError('Produto mestre não encontrado.', 404);
  if (product.status !== 'EM_PRODUCAO') throw new CommandError('Mídia nova só pode ser registrada para produtos em produção.');
  return product;
}

const MEDIA_FORMATS = ['ORIGINAL', 'JPEG', 'PNG', 'WEBP', 'AVIF', 'MP4', 'WEBM'] as const;
const ASPECTS = ['ORIGINAL', '1:1', '4:5', '9:16', '16:9'] as const;
const RIGHTS = ['DECLARADO', 'LICENCIADO', 'EXPIRADO', 'DESCONHECIDO'] as const;
const CANDIDATE_STATUSES = ['CANDIDATO', 'TRIADO', 'INFORMACAO_SOLICITADA', 'APROVADO', 'REJEITADO', 'ARQUIVADO'] as const;
const ORDER_STATUSES = ['RECEBIDO', 'VALIDADO', 'EM_FULFILLMENT', 'ENVIADO', 'EXCECAO', 'CANCELADO', 'RECUSADO'] as const;
const EXCEPTION_CATEGORIES = ['PAGAMENTO', 'ESTOQUE', 'ENDERECO', 'FORNECEDOR', 'FRAUDE', 'INTEGRACAO', 'OUTRO'] as const;

function mediaAssetInput(raw: Input): Omit<MediaAsset, 'id' | 'status' | 'createdAt'> {
  const kind = oneOf(raw, 'kind', ['ORIGINAL', 'DERIVADA'] as const);
  return {
    productId: str(raw, 'productId', 80), url: str(raw, 'url', 2048), kind, purpose: str(raw, 'purpose', 200), provenance: str(raw, 'provenance', 500),
    originalAssetId: kind === 'DERIVADA' ? str(raw, 'originalAssetId', 80) : undefined,
    destination: str(raw, 'destination', 120, false) || 'Universal',
    format: raw.format ? oneOf(raw, 'format', MEDIA_FORMATS) : 'ORIGINAL',
    aspectRatio: raw.aspectRatio ? oneOf(raw, 'aspectRatio', ASPECTS) : 'ORIGINAL',
    rightsStatus: raw.rightsStatus ? oneOf(raw, 'rightsStatus', RIGHTS) : 'DECLARADO',
    rightsHolder: str(raw, 'rightsHolder', 200, false) || undefined, rightsExpiresAt: str(raw, 'rightsExpiresAt', 40, false) || undefined,
    transformationNotes: str(raw, 'transformationNotes', 1000, false) || undefined, changesProductAppearance: raw.changesProductAppearance === true,
    checksum: str(raw, 'checksum', 128, false) || undefined, mimeType: str(raw, 'mimeType', 100, false) || undefined,
    bytes: optionalNum(raw, 'bytes'),
  };
}

const BULK_STATUSES = ['APROVADO', 'REJEITADO', 'ARQUIVADO'] as const;
const BULK_MAX = 200;
function ids(input: Input, key: string): string[] {
  const value = strings(input, key, BULK_MAX);
  if (!value.length || value.some((item) => !item || item.length > 80)) throw new CommandError(`Selecione de 1 a ${BULK_MAX} itens.`);
  return value;
}
const finiteOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const httpsOrEmpty = (value: unknown) => typeof value === 'string' && /^https:\/\/[^\s]{1,2040}$/.test(value) ? value : '';
function supplierInput(input: Input): CandidateSupplier | undefined {
  if (input.supplier === undefined || input.supplier === null) return undefined;
  const raw = obj(input, 'supplier');
  const images = Array.isArray(raw.images) ? raw.images.map(httpsOrEmpty).filter(Boolean).slice(0, 20) : [];
  const variants = (Array.isArray(raw.variants) ? raw.variants : []).slice(0, 50).map((value) => {
    const item = (value && typeof value === 'object' ? value : {}) as Input;
    return { sku: String(item.sku ?? '').slice(0, 120), label: String(item.label ?? '').slice(0, 300), price: finiteOrNull(item.price), stock: finiteOrNull(item.stock), imageUrl: httpsOrEmpty(item.imageUrl) };
  });
  return {
    name: str(raw, 'name', 160), ref: str(raw, 'ref', 160), cost: finiteOrNull(raw.cost), currency: (str(raw, 'currency', 3, false) || 'BRL').toUpperCase(),
    stock: finiteOrNull(raw.stock), imageUrl: httpsOrEmpty(raw.imageUrl) || images[0] || '', images, variants,
  };
}

export const COMMANDS: Record<string, Handler> = {
  'intake.addCandidate': { writes: 'intake', reads: [], roles: always(OPERATE), run: (s, i, c) => addCandidate(s.intake, {
    // 160 characters are enforced by addCandidate on code points; 640 UTF-16 units covers emoji-heavy names.
    name: str(i, 'name', 640), fullName: str(i, 'fullName', 2000, false) || undefined, supplier: supplierInput(i), url: str(i, 'url', 2048), notes: str(i, 'notes', 2000, false),
    source: (i.source === 'TREND' ? 'TREND' : 'MANUAL') as CandidateSource, region: str(i, 'region', 120, false), category: str(i, 'category', 120, false), evidence: strings(i, 'evidence', 50),
  }, c.newId(), c.at, c.actor) },
  'intake.transition': {
    writes: 'intake', reads: [],
    // Portfolio gate: approving or rejecting a candidate is an approver decision.
    roles: (i) => ['APROVADO', 'REJEITADO'].includes(String(i.status)) ? APPROVE : OPERATE,
    run: (s, i, c) => transitionCandidate(s.intake, str(i, 'candidateId', 80), oneOf(i, 'status', CANDIDATE_STATUSES) as CandidateStatus, str(i, 'reason', 2000), c.newId(), c.at, c.actor),
  },
  // Storefront bulk decision. Ineligible items are skipped; the batch fails only if nothing applies.
  'intake.bulkTransition': {
    writes: 'intake', reads: [],
    roles: (i) => ['APROVADO', 'REJEITADO'].includes(String(i.status)) ? APPROVE : OPERATE,
    run: (s, i, c) => bulkTransitionCandidates(s.intake, ids(i, 'candidateIds'), oneOf(i, 'status', BULK_STATUSES), str(i, 'reason', 2000), c.newId, c.at, c.actor).state,
  },
  'products.start': { writes: 'products', reads: ['intake'], roles: always(OPERATE), run: (s, i, c) => {
    const candidate = s.intake.candidates.find((item) => item.id === str(i, 'candidateId', 80));
    if (!candidate) throw new CommandError('Candidato não encontrado.', 404);
    return startProduct(s.products, candidate, c.newId(), c.at, c.actor);
  } },
  'products.update': { writes: 'products', reads: [], roles: always(OPERATE), run: (s, i, c) => updateProduct(s.products, str(i, 'productId', 80), {
    universalTitle: str(i, 'universalTitle', 300), category: str(i, 'category', 200, false), shortDescription: str(i, 'shortDescription', 1000, false),
    longDescription: str(i, 'longDescription', 20000, false), bullets: strings(i, 'bullets', 20), benefits: strings(i, 'benefits', 20), tags: strings(i, 'tags', 50),
    spec: i.spec === undefined ? undefined : obj(i, 'spec') as unknown as UniversalProductSpec,
  }, c.at, c.actor) },
  'products.restoreVersion': { writes: 'products', reads: [], roles: always(OPERATE), run: (s, i, c) => restoreProductVersion(s.products, str(i, 'productId', 80), num(i, 'version'), c.at, c.actor) },
  // Approved media is read from the persisted Media Factory, never trusted from the browser.
  'products.markReady': { writes: 'products', reads: ['media'], roles: always(APPROVE), run: (s, i, c) => {
    const productId = str(i, 'productId', 80);
    return markProductReady(s.products, productId, c.at, hasApprovedMedia(s.media, productId), c.actor);
  } },
  'media.addAsset': { writes: 'media', reads: ['products'], roles: always(OPERATE), run: (s, i, c) => {
    const asset = mediaAssetInput(obj(i, 'asset'));
    productInProduction(s, asset.productId);
    return addMedia(s.media, asset, c.newId(), c.at);
  } },
  'media.review': { writes: 'media', reads: [], roles: always(APPROVE), run: (s, i) => reviewMedia(s.media, str(i, 'assetId', 80), oneOf(i, 'status', ['APROVADA', 'REJEITADA'] as const)) },
  'media.enqueueTransformation': { writes: 'media', reads: [], roles: always(OPERATE), run: (s, i, c) => {
    const source = s.media.assets.find((asset) => asset.id === str(i, 'sourceAssetId', 80));
    if (!source) throw new CommandError('Mídia original não encontrada.', 404);
    return enqueueTransformation(s.media, {
      id: c.newId(), productId: source.productId, sourceAssetId: source.id,
      kind: oneOf(i, 'kind', ['REDIMENSIONAR', 'REENQUADRAR', 'CONVERTER', 'OTIMIZAR'] as const) as TransformationJob['kind'],
      destination: str(i, 'destination', 120), format: oneOf(i, 'format', MEDIA_FORMATS), aspectRatio: oneOf(i, 'aspectRatio', ASPECTS),
    }, c.at);
  } },
  'media.updateJob': { writes: 'media', reads: [], roles: always(OPERATE), run: (s, i, c) => updateTransformationJob(s.media, str(i, 'jobId', 80), oneOf(i, 'status', ['PROCESSANDO', 'FALHOU', 'BLOQUEADO'] as const), c.at, str(i, 'error', 500, false) || undefined) },
  'media.completeTransformation': { writes: 'media', reads: [], roles: always(OPERATE), run: (s, i, c) => {
    const derived = obj(i, 'derived');
    return completeTransformation(s.media, str(i, 'jobId', 80), {
      url: str(derived, 'url', 2048), purpose: str(derived, 'purpose', 200), provenance: str(derived, 'provenance', 500), rightsStatus: 'DECLARADO',
      rightsHolder: str(derived, 'rightsHolder', 200, false) || undefined, transformationNotes: str(derived, 'transformationNotes', 1000),
      changesProductAppearance: derived.changesProductAppearance === true,
    }, c.newId(), c.at);
  } },
  'pricing.calculate': { writes: 'pricing', reads: ['products'], roles: always(OPERATE), run: (s, i, c) => {
    const raw = obj(i, 'input');
    const input: PricingInput = {
      productId: str(raw, 'productId', 80), currency: str(raw, 'currency', 3).toUpperCase(), country: str(raw, 'country', 40, false) || undefined,
      channel: str(raw, 'channel', 80, false) || undefined, store: str(raw, 'store', 80, false) || undefined, offerId: str(raw, 'offerId', 80, false) || undefined,
      fxRate: optionalNum(raw, 'fxRate'), supplierCost: num(raw, 'supplierCost'), shipping: num(raw, 'shipping'), taxes: num(raw, 'taxes'), fixedFees: num(raw, 'fixedFees'),
      operatingCost: num(raw, 'operatingCost'), reserve: num(raw, 'reserve'), channelFeePercent: num(raw, 'channelFeePercent'), paymentFeePercent: num(raw, 'paymentFeePercent'),
      targetMarginPercent: num(raw, 'targetMarginPercent'), minimumMarginPercent: num(raw, 'minimumMarginPercent'),
    };
    readyProduct(s, input.productId);
    return calculatePrice(s.pricing, input, c.newId(), c.at);
  } },
  // The approver identity is the authenticated actor, not a free-text field from the browser.
  'pricing.approve': { writes: 'pricing', reads: [], roles: always(APPROVE), run: (s, i, c) => approvePrice(s.pricing, str(i, 'calculationId', 80), c.actor, c.at) },
  'pricing.recalculateSupplierCost': { writes: 'pricing', reads: [], roles: always(['ADMIN', 'SYSTEM']), run: (s, i, c) => recalculateSupplierCost(s.pricing, str(i, 'calculationId', 80), num(i, 'supplierCost'), c.newId(), c.at) },
  'pricing.releaseQuarantine': { writes: 'pricing', reads: [], roles: always(APPROVE), run: (s, i, c) => releaseQuarantine(s.pricing, str(i, 'calculationId', 80), c.actor, str(i, 'reason', 1000)) },
  'orders.receive': { writes: 'orders', reads: ['products'], roles: always([...OPERATE, 'SYSTEM']), run: (s, i, c) => {
    const productId = str(i, 'productId', 80);
    readyProduct(s, productId);
    return receiveOrder(s.orders, { externalOrderId: str(i, 'externalOrderId', 160), productId, salePrice: num(i, 'salePrice'), costSnapshot: num(i, 'costSnapshot'), currency: (str(i, 'currency', 3, false) || 'BRL').toUpperCase(), customerRef: str(i, 'customerRef', 100, false) }, c.newId(), c.at);
  } },
  'orders.advance': { writes: 'orders', reads: [], roles: always(OPERATE), run: (s, i, c) => advanceOrder(s.orders, str(i, 'orderId', 80), oneOf(i, 'status', ORDER_STATUSES) as OrderStatus, c.at, str(i, 'tracking', 120, false)) },
  'orders.flagException': { writes: 'orders', reads: [], roles: always(OPERATE), run: (s, i, c) => flagOrderException(s.orders, str(i, 'orderId', 80), str(i, 'reason', 500), c.at, oneOf(i, 'category', EXCEPTION_CATEGORIES) as ExceptionCategory) },
  'orders.resolveException': {
    writes: 'orders', reads: [],
    // Closing an order (cancel/refuse) is an approver decision; recovering it is operational.
    roles: (i) => i.resolution === 'RECUPERAR' ? OPERATE : APPROVE,
    run: (s, i, c) => resolveOrderException(s.orders, str(i, 'orderId', 80), c.at, oneOf(i, 'resolution', ['RECUPERAR', 'CANCELAR', 'RECUSAR'] as const) as ExceptionResolution, str(i, 'note', 500, false)),
  },
  'orders.purgeExpired': { writes: 'orders', reads: [], roles: always(['ADMIN', 'SYSTEM']), run: (s, _i, c) => purgeExpiredOrderData(s.orders, c.at) },
  'catalog.upsertParty': { writes: 'catalog', reads: [], roles: always(APPROVE), run: (s, i) => upsertParty(s.catalog, oneOf(i, 'kind', ['brand', 'store'] as const), { id: str(i, 'id', 80), name: str(i, 'name', 160), active: i.active !== false }) },
  'catalog.assignProduct': { writes: 'catalog', reads: ['products'], roles: always(APPROVE), run: (s, i, c) => {
    const productId = str(i, 'productId', 80);
    readyProduct(s, productId);
    return assignProduct(s.catalog, productId, { brandIds: strings(i, 'brandIds'), storeIds: strings(i, 'storeIds'), destinations: strings(i, 'destinations') }, c.at);
  } },
  'catalog.addOffer': { writes: 'catalog', reads: ['products'], roles: always(OPERATE), run: (s, i, c) => {
    const productId = str(i, 'productId', 80);
    readyProduct(s, productId);
    return addSupplierOffer(s.catalog, { productId, supplierRef: str(i, 'supplierRef', 160), supplierName: str(i, 'supplierName', 160), cost: num(i, 'cost'), currency: str(i, 'currency', 3), stock: nullableInt(i, 'stock'), leadTimeDays: nullableInt(i, 'leadTimeDays') }, c.newId(), c.at);
  } },
  'catalog.bulkCurate': { writes: 'catalog', reads: ['products'], roles: always(APPROVE), run: (s, i, c) => {
    const productIds = ids(i, 'productIds');
    productIds.forEach((productId) => readyProduct(s, productId));
    return curateProducts(s.catalog, productIds, oneOf(i, 'status', BULK_STATUSES), str(i, 'reason', 2000), c.actor, c.at);
  } },
  'catalog.refreshOffer': { writes: 'catalog', reads: [], roles: always(['ADMIN', 'SYSTEM']), run: (s, i, c) => refreshSupplierOffer(s.catalog, str(i, 'offerId', 80), { cost: num(i, 'cost'), currency: str(i, 'currency', 3), stock: nullableInt(i, 'stock'), leadTimeDays: nullableInt(i, 'leadTimeDays') }, c.at) },
};

export function commandSpec(type: string) {
  const handler = Object.hasOwn(COMMANDS, type) ? COMMANDS[type] : undefined;
  if (!handler) throw new CommandError('Comando desconhecido.', 404);
  return handler;
}

export function authorizeCommand(type: string, input: Input, role: string) {
  const handler = commandSpec(type);
  if (!(handler.roles(input) as string[]).includes(role)) throw new CommandError('Seu papel não permite executar esta ação.', 403);
  return handler;
}

export function executeCommand(type: string, states: CommandStates, input: Input, ctx: CommandContext) {
  const handler = authorizeCommand(type, input, ctx.role);
  try {
    return { namespace: handler.writes, payload: handler.run(states, input, ctx) };
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError(error instanceof Error ? error.message : 'Operação indisponível.', 422);
  }
}
