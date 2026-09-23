import { createHmac } from 'node:crypto';
import type { SupplierAdapter, SupplierProduct } from './types';

const BASE_URL = 'https://eco.taobao.com/router/rest';
const REQUEST_TIMEOUT_MS = 15_000;

export function signAliExpressParams(params: Record<string, string>, appSecret: string): string {
  const payload = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join('');
  return createHmac('md5', appSecret).update(payload, 'utf8').digest('hex').toUpperCase();
}

function topTimestamp(now = new Date()): string {
  const inChina = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return inChina.toISOString().replace('T', ' ').slice(0, 19);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const wrapper = record(value);
  const nested = wrapper.product ?? wrapper.ae_item_sku_info_d_t_o;
  return Array.isArray(nested) ? nested : [];
}

function apiError(data: Record<string, unknown>): Error | null {
  const error = record(data.error_response);
  if (!Object.keys(error).length) return null;
  const code = String(error.sub_code ?? error.code ?? 'UNKNOWN');
  const message = String(error.sub_msg ?? error.msg ?? 'Erro desconhecido');
  return new Error(`AliExpress ${code}: ${message}`);
}

export async function callAliExpressApi(
  method: string,
  appKey: string,
  appSecret: string,
  session: string,
  extra: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  if (!appKey.trim() || !appSecret.trim()) throw new Error('App Key e App Secret são obrigatórios.');
  if (!session.trim()) throw new Error('Access Token é obrigatório.');
  const params: Record<string, string> = {
    method, app_key: appKey, session, timestamp: topTimestamp(), format: 'json', v: '2.0', sign_method: 'hmac', ...extra,
  };
  params.sign = signAliExpressParams(params, appSecret);
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`AliExpress HTTP ${response.status}`);
  let data: Record<string, unknown>;
  try { data = record(await response.json()); } catch { throw new Error('AliExpress retornou uma resposta inválida.'); }
  const error = apiError(data);
  if (error) throw error;
  return data;
}

function responseFor(data: Record<string, unknown>, method: string): Record<string, unknown> {
  const expected = `${method.replaceAll('.', '_')}_response`;
  return record(data[expected] ?? Object.entries(data).find(([key]) => key.endsWith('_response'))?.[1]);
}

function productResults(response: Record<string, unknown>): unknown[] {
  const outer = record(response.resp_result);
  const result = record(outer.result ?? response.result);
  return list(result.products);
}

export function createAliExpressAdapter(
  config: Record<string, string>, secrets: Record<string, string>, _environment: 'SANDBOX' | 'PRODUCTION',
): SupplierAdapter {
  void _environment; // AliExpress does not provide a separate DS sandbox gateway.
  const appKey = config.appKey ?? '';
  const appSecret = secrets.appSecret ?? '';
  const accessToken = secrets.accessToken ?? '';
  return {
    async test() {
      try {
        const testProductId = config.testProductId?.trim();
        if (!testProductId) return { ok: false, message: 'Informe um ID de produto de teste para validar o Access Token.' };
        await callAliExpressApi('aliexpress.ds.product.get', appKey, appSecret, accessToken, {
          product_id: testProductId,
          ship_to_country: config.shipToCountry || 'BR', target_currency: config.currency || 'BRL', target_language: config.language || 'PT',
        });
        return { ok: true, message: 'Conexão autenticada com a AliExpress DS API.' };
      } catch (error) {
        return { ok: false, message: `Falha ao conectar: ${error instanceof Error ? error.message : 'erro desconhecido'}` };
      }
    },

    async searchProducts(query, options = {}) {
      const { page = 1, pageSize = 20, currency = 'BRL' } = options;
      if (!query.trim()) return [];
      const data = await callAliExpressApi('aliexpress.affiliate.product.query', appKey, appSecret, accessToken, {
        keywords: query.trim(), page_no: String(Math.max(1, Math.trunc(page))),
        page_size: String(Math.min(50, Math.max(1, Math.trunc(pageSize)))), target_currency: currency.toUpperCase(),
        target_language: config.language || 'PT', ship_to_country: config.shipToCountry || 'BR',
      });
      return productResults(responseFor(data, 'aliexpress.affiliate.product.query')).map((value) => {
        const item = record(value);
        return {
          itemId: String(item.product_id ?? ''), title: String(item.product_title ?? ''),
          price: Number(item.target_sale_price ?? item.sale_price ?? 0),
          currency: String(item.target_sale_price_currency ?? currency).toUpperCase(),
          imageUrl: String(item.product_main_image_url ?? ''), detailUrl: String(item.product_detail_url ?? ''),
        } satisfies SupplierProduct;
      }).filter((item) => item.itemId && Number.isFinite(item.price));
    },

    async getProduct(itemId) {
      if (!/^\d+$/.test(itemId)) throw new Error('ID de produto AliExpress inválido.');
      const data = await callAliExpressApi('aliexpress.ds.product.get', appKey, appSecret, accessToken, {
        product_id: itemId, ship_to_country: config.shipToCountry || 'BR',
        target_currency: config.currency || 'BRL', target_language: config.language || 'PT',
      });
      const result = record(responseFor(data, 'aliexpress.ds.product.get').result);
      const base = record(result.ae_item_base_info_dto);
      const multimedia = record(result.ae_item_multimedia_info_dto);
      const skus = list(result.ae_item_sku_info_dtos).map(record);
      const availableSkus = skus.filter((sku) => sku.sku_stock === true);
      const prices = (availableSkus.length ? availableSkus : skus).map((sku) => Number(sku.sku_price)).filter(Number.isFinite);
      if (!Object.keys(base).length) throw new Error('AliExpress não retornou dados do produto.');
      return {
        itemId: String(base.product_id ?? itemId), title: String(base.subject ?? ''),
        price: prices.length ? Math.min(...prices) : 0,
        currency: String(base.currency_code ?? config.currency ?? 'USD').toUpperCase(),
        imageUrl: String(base.image_url ?? list(multimedia.image_urls)[0] ?? ''),
        detailUrl: `https://www.aliexpress.com/item/${itemId}.html`,
        stock: skus.length && !availableSkus.length ? 0 : undefined,
      } satisfies SupplierProduct;
    },
  };
}
