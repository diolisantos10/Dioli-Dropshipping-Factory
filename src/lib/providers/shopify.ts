import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChannelAdapter, ChannelListingInput, ChannelOrder } from './types';

// Shopify Admin GraphQL API. Three credential modes are supported:
// 1. OAuth authorization code ("Conectar com Shopify") -> offline access token;
// 2. Admin API access token pasted directly (legacy custom apps);
// 3. Client credentials grant (Dev Dashboard app in the same organization as the store; 24h token).
export const SHOPIFY_DEFAULT_API_VERSION = '2026-07';
export const SHOPIFY_SCOPES = 'write_products,read_orders';
const REQUEST_TIMEOUT_MS = 20_000;

export type ShopifyToken = { accessToken: string; scope: string; expiresAt: string };

export function normalizeShopDomain(value: string): string {
  const raw = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const domain = raw.includes('.') ? raw : `${raw}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(domain)) throw new Error('Informe o domínio da loja no formato minha-loja.myshopify.com.');
  return domain;
}

function apiVersion(value?: string) {
  const version = value?.trim() || SHOPIFY_DEFAULT_API_VERSION;
  if (!/^\d{4}-(01|04|07|10)$/.test(version)) throw new Error('Versão da API Shopify inválida (use AAAA-MM, ex.: 2026-07).');
  return version;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function json(response: Response, label: string) {
  try { return record(await response.json()); } catch { throw new Error(`${label}: resposta inválida (HTTP ${response.status}).`); }
}

export async function shopifyGraphql<T = Record<string, unknown>>(
  shop: string, accessToken: string, version: string, query: string, variables: Record<string, unknown> = {},
): Promise<T> {
  if (!accessToken.trim()) throw new Error('Conecte a loja Shopify (token de acesso ausente).');
  const url = `https://${normalizeShopDomain(shop)}/admin/api/${apiVersion(version)}/graphql.json`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) throw new Error(`Shopify recusou o token (HTTP ${response.status}).`);
    if (response.status === 429 && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))); continue; }
    const body = await json(response, 'Shopify');
    const errors = Array.isArray(body.errors) ? body.errors.map(record) : [];
    const throttled = errors.some((error) => record(error.extensions).code === 'THROTTLED');
    if (throttled && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))); continue; }
    if (!response.ok || errors.length) {
      const message = errors.length
        ? errors.map((error) => String(error.message ?? '')).filter(Boolean).join('; ')
        : typeof body.errors === 'string' ? body.errors : '';
      throw new Error(`Shopify ${response.status}: ${message || 'erro desconhecido'}`);
    }
    return record(body.data) as T;
  }
  throw new Error('Shopify limitou as requisições (throttled). Tente novamente.');
}

export function shopifyAuthorizeUrl(shop: string, clientId: string, redirectUri: string, state: string, scopes = SHOPIFY_SCOPES) {
  const url = new URL(`https://${normalizeShopDomain(shop)}/admin/oauth/authorize`);
  url.search = new URLSearchParams({ client_id: clientId, scope: scopes, redirect_uri: redirectUri, state }).toString();
  return url.href;
}

export function verifyShopifyHmac(query: URLSearchParams, clientSecret: string): boolean {
  const received = query.get('hmac') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(received) || !clientSecret) return false;
  const message = [...query.entries()].filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => `${key}=${value}`).join('&');
  const expected = createHmac('sha256', clientSecret).update(message, 'utf8').digest();
  const actual = Buffer.from(received, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeToken(body: Record<string, unknown>, now: number): ShopifyToken {
  const accessToken = String(body.access_token ?? '');
  if (!accessToken) throw new Error('Shopify não retornou access_token.');
  const expiresIn = Number(body.expires_in);
  return { accessToken, scope: String(body.scope ?? ''), expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(now + expiresIn * 1000).toISOString() : '' };
}

export async function exchangeShopifyCode(shop: string, clientId: string, clientSecret: string, code: string, now = Date.now()) {
  if (!/^[\w-]{8,200}$/.test(code)) throw new Error('Código de autorização Shopify inválido.');
  const response = await fetch(`https://${normalizeShopDomain(shop)}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error',
  });
  const body = await json(response, 'Shopify OAuth');
  if (!response.ok) throw new Error(`Shopify OAuth ${response.status}: ${String(body.error_description ?? body.error ?? body.errors ?? 'falha')}`);
  return normalizeToken(body, now);
}

export async function shopifyClientCredentialsToken(shop: string, clientId: string, clientSecret: string, now = Date.now()) {
  const response = await fetch(`https://${normalizeShopDomain(shop)}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error',
  });
  const body = await json(response, 'Shopify client credentials');
  if (!response.ok) throw new Error(`Shopify client credentials ${response.status}: ${String(body.error_description ?? body.error ?? body.errors ?? 'falha')}`);
  return normalizeToken(body, now);
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function plainTextToHtml(value: string) {
  return value.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
}

export function productSetVariables(input: ChannelListingInput) {
  if (!input.title.trim()) throw new Error('Título obrigatório para publicar.');
  if (!Number.isFinite(input.price) || input.price <= 0) throw new Error('Preço aprovado inválido para publicação.');
  const variables: Record<string, unknown> = {
    synchronous: true,
    input: {
      title: input.title.trim().slice(0, 255),
      descriptionHtml: input.descriptionHtml,
      // Publication is always created as DRAFT: going live in the storefront stays an explicit human decision in Shopify.
      status: 'DRAFT',
      vendor: input.vendor.trim().slice(0, 255),
      productType: input.productType.trim().slice(0, 255),
      tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 250),
      productOptions: [{ name: 'Title', position: 1, values: [{ name: 'Default Title' }] }],
      variants: [{ optionValues: [{ optionName: 'Title', name: 'Default Title' }], price: input.price.toFixed(2), inventoryItem: { sku: input.sku.slice(0, 255) } }],
      files: input.imageUrls.filter((url) => url.startsWith('https://')).slice(0, 10).map((originalSource) => ({ originalSource, contentType: 'IMAGE' })),
    },
  };
  if (input.externalId) variables.identifier = { id: input.externalId };
  return variables;
}

const PRODUCT_SET = `mutation ddfProductSet($identifier: ProductSetIdentifiers, $input: ProductSetInput!, $synchronous: Boolean) {
  productSet(identifier: $identifier, input: $input, synchronous: $synchronous) {
    product { id handle status }
    userErrors { field message code }
  }
}`;

const RECENT_ORDERS = `query ddfOrders($first: Int!, $query: String) {
  orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id name createdAt cancelledAt displayFinancialStatus currencyCode
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 50) { nodes { sku quantity product { id } originalUnitPriceSet { shopMoney { amount } } } }
    }
  }
}`;

export function parseShopifyOrders(data: Record<string, unknown>): ChannelOrder[] {
  const nodes = record(data.orders).nodes;
  return (Array.isArray(nodes) ? nodes : []).map(record).map((order) => {
    const total = record(record(order.totalPriceSet).shopMoney);
    const lines = record(order.lineItems).nodes;
    return {
      externalOrderId: String(order.id ?? ''), name: String(order.name ?? ''), createdAt: String(order.createdAt ?? ''),
      currency: String(total.currencyCode ?? order.currencyCode ?? ''), total: Number(total.amount ?? 0),
      financialStatus: String(order.displayFinancialStatus ?? ''), cancelled: Boolean(order.cancelledAt),
      lines: (Array.isArray(lines) ? lines : []).map(record).map((line) => ({
        externalProductId: record(line.product).id ? String(record(line.product).id) : null,
        sku: String(line.sku ?? ''), quantity: Number(line.quantity ?? 0),
        unitPrice: Number(record(record(line.originalUnitPriceSet).shopMoney).amount ?? 0),
      })),
    };
  }).filter((order) => order.externalOrderId);
}

export function createShopifyAdapter(config: Record<string, string>, secrets: Record<string, string>): ChannelAdapter {
  const shop = config.storeDomain ?? '';
  const version = config.apiVersion ?? '';
  const token = secrets.accessToken ?? '';
  return {
    async test() {
      try {
        const data = await shopifyGraphql<{ shop?: { name?: string; currencyCode?: string } }>(shop, token, version, '{ shop { name myshopifyDomain currencyCode } }');
        if (!data.shop?.name) return { ok: false, message: 'Shopify não retornou dados da loja.' };
        return { ok: true, message: `Loja Shopify autenticada: ${data.shop.name} (${data.shop.currencyCode ?? 'moeda n/d'}).` };
      } catch (error) {
        return { ok: false, message: `Falha ao conectar: ${error instanceof Error ? error.message : 'erro desconhecido'}` };
      }
    },
    async upsertListing(input) {
      const data = await shopifyGraphql(shop, token, version, PRODUCT_SET, productSetVariables(input));
      const result = record(data.productSet);
      const errors = Array.isArray(result.userErrors) ? result.userErrors.map(record) : [];
      if (errors.length) throw new Error(`Shopify recusou o produto: ${errors.map((error) => String(error.message)).join('; ')}`);
      const product = record(result.product);
      if (!product.id) throw new Error('Shopify não retornou o produto publicado.');
      const numericId = String(product.id).split('/').pop();
      return { externalId: String(product.id), handle: String(product.handle ?? ''), status: String(product.status ?? 'DRAFT'), adminUrl: `https://${normalizeShopDomain(shop)}/admin/products/${numericId}` };
    },
    async listRecentOrders(options = {}) {
      const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 50)));
      const since = options.since && !Number.isNaN(Date.parse(options.since)) ? `created_at:>='${new Date(options.since).toISOString()}'` : undefined;
      return parseShopifyOrders(await shopifyGraphql(shop, token, version, RECENT_ORDERS, { first: limit, query: since }));
    },
  };
}
