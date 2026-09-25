import { createHmac } from 'node:crypto';
import type { SupplierAdapter, SupplierProduct } from './types';

// AliExpress Open Platform (IOP/GOP protocol). Business APIs go through /sync with
// `method` as a signed parameter; system APIs (/auth/*) go through /rest{path} and
// prefix the path to the signature payload. Signature: HMAC-SHA256, uppercase hex.
export const ALIEXPRESS_GATEWAY = 'https://api-sg.aliexpress.com';
export const ALIEXPRESS_SYNC_URL = `${ALIEXPRESS_GATEWAY}/sync`;
const REQUEST_TIMEOUT_MS = 15_000;

export type AliExpressCredentials = { appKey: string; appSecret: string; accessToken?: string };
export type AliExpressToken = {
  accessToken: string; refreshToken: string; expiresAt: string; refreshExpiresAt: string;
  account: string; sellerId: string; userId: string;
};

export function signAliExpressRequest(params: Record<string, string>, appSecret: string, apiPath = ''): string {
  const payload = apiPath + Object.keys(params).filter((key) => key !== 'sign' && params[key] !== undefined && params[key] !== '')
    .sort().map((key) => `${key}${params[key]}`).join('');
  return createHmac('sha256', appSecret).update(payload, 'utf8').digest('hex').toUpperCase();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// The gateway wraps arrays either directly or inside a single-key object
// (e.g. { ae_item_sku_info_d_t_o: [...] } or { selection_search_product: [...] }).
function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const values = Object.values(record(value));
  return values.length === 1 && Array.isArray(values[0]) ? values[0] : [];
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function money(value: unknown): number {
  const parsed = Number(text(value).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function httpsUrl(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  try { const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw); url.protocol = 'https:'; return url.href; } catch { return ''; }
}

function requireCredentials(credentials: AliExpressCredentials, needsToken: boolean) {
  if (!credentials.appKey.trim() || !credentials.appSecret.trim()) throw new Error('App Key e App Secret da AliExpress são obrigatórios.');
  if (needsToken && !credentials.accessToken?.trim()) throw new Error('Conecte a conta AliExpress (Access Token ausente).');
}

async function post(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'error',
  });
  let data: Record<string, unknown>;
  try { data = record(await response.json()); } catch { throw new Error(`AliExpress retornou uma resposta inválida (HTTP ${response.status}).`); }
  if (!response.ok && !Object.keys(data).length) throw new Error(`AliExpress HTTP ${response.status}`);
  return data;
}

function gatewayError(data: Record<string, unknown>): Error | null {
  const error = record(data.error_response);
  const source = Object.keys(error).length ? error : data;
  const code = text(source.sub_code ?? source.code);
  if (!code || code === '0') return null;
  const message = text(source.sub_msg ?? source.msg ?? source.message) || 'Erro desconhecido';
  return new Error(`AliExpress ${code}: ${message}`);
}

export async function callAliExpressBusiness(
  method: string, credentials: AliExpressCredentials, extra: Record<string, string> = {}, now = Date.now(),
): Promise<Record<string, unknown>> {
  requireCredentials(credentials, true);
  const params: Record<string, string> = {
    ...extra, method, app_key: credentials.appKey, access_token: credentials.accessToken ?? '',
    timestamp: String(now), sign_method: 'sha256',
  };
  params.sign = signAliExpressRequest(params, credentials.appSecret);
  const data = await post(ALIEXPRESS_SYNC_URL, params);
  const error = gatewayError(data);
  if (error) throw error;
  const body = record(data[`${method.replaceAll('.', '_')}_response`] ?? Object.entries(data).find(([key]) => key.endsWith('_response'))?.[1]);
  const code = text(body.rsp_code ?? body.code);
  if (code && code !== '0' && code !== '200') throw new Error(`AliExpress ${code}: ${text(body.rsp_msg ?? body.msg) || 'falha na operação'}`);
  return body;
}

export async function callAliExpressSystem(
  apiPath: string, credentials: AliExpressCredentials, extra: Record<string, string>, now = Date.now(),
): Promise<Record<string, unknown>> {
  requireCredentials(credentials, false);
  const params: Record<string, string> = { ...extra, app_key: credentials.appKey, timestamp: String(now), sign_method: 'sha256' };
  params.sign = signAliExpressRequest(params, credentials.appSecret, apiPath);
  const data = await post(`${ALIEXPRESS_GATEWAY}/rest${apiPath}`, params);
  const error = gatewayError(data);
  if (error) throw error;
  return data;
}

export function aliExpressAuthorizeUrl(appKey: string, redirectUri: string, state: string): string {
  const url = new URL(`${ALIEXPRESS_GATEWAY}/oauth/authorize`);
  url.search = new URLSearchParams({ response_type: 'code', force_auth: 'true', redirect_uri: redirectUri, client_id: appKey, state }).toString();
  return url.href;
}

function absoluteExpiry(absolute: unknown, relativeSeconds: unknown, now: number): string {
  const abs = Number(absolute);
  if (Number.isFinite(abs) && abs > now) return new Date(abs).toISOString();
  const rel = Number(relativeSeconds);
  return new Date(now + (Number.isFinite(rel) && rel > 0 ? rel * 1000 : 0)).toISOString();
}

export function normalizeAliExpressToken(data: Record<string, unknown>, now = Date.now()): AliExpressToken {
  const accessToken = text(data.access_token);
  if (!accessToken) throw new Error('AliExpress não retornou access_token.');
  return {
    accessToken, refreshToken: text(data.refresh_token),
    expiresAt: absoluteExpiry(data.expire_time, data.expires_in, now),
    refreshExpiresAt: absoluteExpiry(data.refresh_token_valid_time, data.refresh_expires_in, now),
    account: text(data.account), sellerId: text(data.seller_id), userId: text(data.user_id ?? data.havana_id),
  };
}

export async function exchangeAliExpressCode(credentials: AliExpressCredentials, code: string): Promise<AliExpressToken> {
  if (!/^[\w.-]{4,200}$/.test(code)) throw new Error('Código de autorização AliExpress inválido.');
  return normalizeAliExpressToken(await callAliExpressSystem('/auth/token/create', credentials, { code }));
}

export async function refreshAliExpressToken(credentials: AliExpressCredentials, refreshToken: string): Promise<AliExpressToken> {
  if (!refreshToken.trim()) throw new Error('Refresh token AliExpress ausente; reconecte a conta.');
  return normalizeAliExpressToken(await callAliExpressSystem('/auth/token/refresh', credentials, { refresh_token: refreshToken }));
}

export function tokenNeedsRefresh(expiresAt: string | undefined, now = Date.now(), marginMs = 24 * 60 * 60 * 1000): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at - now <= marginMs;
}

function searchLocale(language: string) {
  const value = language.trim();
  if (/^[a-z]{2}_[A-Z]{2}$/.test(value)) return value;
  return value.toLowerCase() === 'en' ? 'en_US' : 'pt_BR';
}

export function parseDsSearchProducts(body: Record<string, unknown>, currency: string): SupplierProduct[] {
  const data = record(record(body.data ?? record(body.result).data ?? body.result));
  return list(data.products).map((value) => {
    const item = record(value);
    const itemId = text(item.itemId ?? item.item_id ?? item.product_id);
    const target = money(item.targetSalePrice);
    const sale = money(item.salePrice);
    const useTarget = Number.isFinite(target) && target > 0;
    return {
      itemId, title: text(item.title ?? item.product_title),
      price: useTarget ? target : sale,
      currency: (useTarget ? text(item.targetOriginalPriceCurrency) || currency : text(item.salePriceCurrency) || currency).toUpperCase(),
      imageUrl: httpsUrl(item.itemMainPic ?? item.product_main_image_url),
      detailUrl: /^\d+$/.test(itemId) ? `https://www.aliexpress.com/item/${itemId}.html` : httpsUrl(item.itemUrl),
    } satisfies SupplierProduct;
  }).filter((item) => /^\d+$/.test(item.itemId) && item.title && Number.isFinite(item.price) && item.price > 0);
}

export function parseDsProduct(body: Record<string, unknown>, itemId: string, fallbackCurrency: string): SupplierProduct {
  const result = record(body.result);
  const base = record(result.ae_item_base_info_dto);
  if (!Object.keys(base).length) throw new Error('AliExpress não retornou dados do produto.');
  const multimedia = record(result.ae_multimedia_info_dto ?? result.ae_item_multimedia_info_dto);
  const skus = list(result.ae_item_sku_info_dtos).map(record);
  const stockOf = (sku: Record<string, unknown>) => {
    const quantity = Number(sku.sku_available_stock ?? sku.ipm_sku_stock);
    if (Number.isFinite(quantity)) return quantity;
    return sku.sku_stock === true ? null : sku.sku_stock === false ? 0 : null;
  };
  const available = skus.filter((sku) => stockOf(sku) !== 0);
  const priceOf = (sku: Record<string, unknown>) => {
    const offer = money(sku.offer_sale_price);
    return Number.isFinite(offer) && offer > 0 ? offer : money(sku.sku_price);
  };
  const prices = (available.length ? available : skus).map(priceOf).filter((price) => Number.isFinite(price) && price > 0);
  const quantities = skus.map(stockOf);
  const knownStock = quantities.every((quantity) => typeof quantity === 'number');
  const images = Array.isArray(multimedia.image_urls) ? multimedia.image_urls.map(text) : text(multimedia.image_urls).split(';');
  const deliveryDays = Number(record(result.logistics_info_dto).delivery_time);
  return {
    itemId: text(base.product_id) || itemId, title: text(base.subject),
    price: prices.length ? Math.min(...prices) : 0,
    currency: (text(skus[0]?.currency_code) || text(base.currency_code) || fallbackCurrency).toUpperCase(),
    imageUrl: httpsUrl(images.find(Boolean)),
    detailUrl: `https://www.aliexpress.com/item/${itemId}.html`,
    stock: skus.length && !available.length ? 0 : knownStock && skus.length ? quantities.reduce<number>((sum, quantity) => sum + (quantity ?? 0), 0) : undefined,
    shippingTime: Number.isFinite(deliveryDays) && deliveryDays > 0 ? `${deliveryDays} dias` : undefined,
  } satisfies SupplierProduct;
}

export function aliExpressCredentialsFrom(config: Record<string, string>, secrets: Record<string, string>): AliExpressCredentials {
  return {
    appKey: config.appKey?.trim() || process.env.ALIEXPRESS_APP_KEY?.trim() || '',
    appSecret: secrets.appSecret?.trim() || process.env.ALIEXPRESS_APP_SECRET?.trim() || '',
    accessToken: secrets.accessToken?.trim() ?? '',
  };
}

export function createAliExpressAdapter(
  config: Record<string, string>, secrets: Record<string, string>, _environment: 'SANDBOX' | 'PRODUCTION',
): SupplierAdapter {
  void _environment; // AliExpress does not provide a separate DS sandbox gateway.
  const credentials = aliExpressCredentialsFrom(config, secrets);
  const country = (config.shipToCountry || 'BR').toUpperCase();
  const defaultCurrency = (config.currency || 'BRL').toUpperCase();
  const language = config.language || 'pt';

  async function search(query: string, page: number, pageSize: number, currency: string) {
    const body = await callAliExpressBusiness('aliexpress.ds.text.search', credentials, {
      keyWord: query, local: searchLocale(language), countryCode: country, currency,
      pageIndex: String(page), pageSize: String(pageSize),
    });
    return parseDsSearchProducts(body, currency);
  }

  return {
    async test() {
      try {
        const testProductId = config.testProductId?.trim();
        if (testProductId) {
          await callAliExpressBusiness('aliexpress.ds.product.get', credentials, {
            product_id: testProductId, ship_to_country: country, target_currency: defaultCurrency, target_language: language.toLowerCase(),
          });
        } else {
          await search('phone case', 1, 1, defaultCurrency);
        }
        return { ok: true, message: 'Conexão autenticada com a AliExpress Dropshipping API (api-sg).' };
      } catch (error) {
        return { ok: false, message: `Falha ao conectar: ${error instanceof Error ? error.message : 'erro desconhecido'}` };
      }
    },

    async searchProducts(query, options = {}) {
      const { page = 1, pageSize = 20, currency = defaultCurrency } = options;
      if (!query.trim()) return [];
      return search(query.trim(), Math.max(1, Math.trunc(page)), Math.min(50, Math.max(1, Math.trunc(pageSize))), currency.toUpperCase());
    },

    async getProduct(itemId) {
      if (!/^\d+$/.test(itemId)) throw new Error('ID de produto AliExpress inválido.');
      const body = await callAliExpressBusiness('aliexpress.ds.product.get', credentials, {
        product_id: itemId, ship_to_country: country, target_currency: defaultCurrency, target_language: language.toLowerCase(),
      });
      return parseDsProduct(body, itemId, defaultCurrency);
    },
  };
}
