import { createHmac } from 'node:crypto';
import type { SupplierAdapter, SupplierProduct } from './types';

const BASE_URL = 'https://api-sg.aliexpress.com/sync';

function sign(params: Record<string, string>, appSecret: string): string {
    const sorted = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
    const payload = `${appSecret}${sorted}${appSecret}`;
    return createHmac('sha256', appSecret).update(payload).digest('hex').toUpperCase();
}

async function callApi(
    method: string, appKey: string, appSecret: string, accessToken: string,
    extra: Record<string, string> = {}
  ): Promise<Record<string, unknown>> {
    const timestamp = String(Date.now());
    const base: Record<string, string> = { app_key: appKey, timestamp, sign_method: 'sha256', method, access_token: accessToken, ...extra };
    base.sign = sign(base, appSecret);
    const body = new URLSearchParams(base as Record<string, string>).toString();
    const res = await fetch(BASE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
}

export function createAliExpressAdapter(
    config: Record<string, string>,
    secrets: Record<string, string>,
    _environment: 'SANDBOX' | 'PRODUCTION'
  ): SupplierAdapter {
    const appKey = config.appKey ?? '';
    const appSecret = secrets.appSecret ?? '';
    const accessToken = secrets.accessToken ?? '';

  return {
        async test() {
                try {
                          const now = Date.now();
                          const startTime = new Date(now - 86400000).toISOString().replace('T', ' ').slice(0, 19);
                          const endTime = new Date(now).toISOString().replace('T', ' ').slice(0, 19);
                          const data = await callApi('aliexpress.ds.commissionorder.listbyindex', appKey, appSecret, accessToken, { start_time: startTime, end_time: endTime, page_size: '1', page_no: '1' });
                          const respKey = Object.keys(data).find((k) => k.includes('response'));
                          const resp = respKey ? (data[respKey] as Record<string, unknown>) : data;
                          if (resp.code && String(resp.code) !== '200' && String(resp.code) !== '0') {
                                      return { ok: false, message: `AliExpress error ${resp.code}: ${String(resp.msg ?? resp.message ?? 'unknown')}` };
                          }
                          return { ok: true, message: 'Conexão com AliExpress DS API bem-sucedida.' };
                } catch (err) {
                          return { ok: false, message: `Falha ao conectar: ${(err as Error).message}` };
                }
        },

        async searchProducts(query, options = {}) {
                const { page = 1, pageSize = 20, currency = 'BRL' } = options;
                const data = await callApi('aliexpress.affiliate.product.query', appKey, appSecret, accessToken, { keywords: query, page_no: String(page), page_size: String(pageSize), currency_code: currency });
                const respKey = Object.keys(data).find((k) => k.includes('response'));
                const resp = respKey ? (data[respKey] as Record<string, unknown>) : data;
                const result = (resp.result as Record<string, unknown>) ?? {};
                const products = (result.products as { product: unknown[] })?.product ?? [];
                return products.map((p) => {
                          const item = p as Record<string, unknown>;
                          return { itemId: String(item.product_id ?? ''), title: String(item.product_title ?? ''), price: Number(item.target_sale_price ?? item.sale_price ?? 0), currency: String(item.target_sale_price_currency ?? currency), imageUrl: String(item.product_main_image_url ?? ''), detailUrl: String(item.product_detail_url ?? '') } satisfies SupplierProduct;
                });
        },

        async getProduct(itemId) {
                const data = await callApi('aliexpress.ds.product.get', appKey, appSecret, accessToken, { product_id: itemId });
                const respKey = Object.keys(data).find((k) => k.includes('response'));
                const resp = respKey ? (data[respKey] as Record<string, unknown>) : data;
                const result = (resp.result as Record<string, unknown>) ?? {};
                const ae = (result.ae_item_base_info_dto as Record<string, unknown>) ?? {};
                const skus = (result.ae_item_sku_info_dtos as { ae_item_sku_info_d_t_o: unknown[] })?.ae_item_sku_info_d_t_o ?? [];
                const firstSku = (skus[0] as Record<string, unknown>) ?? {};
                const price = Number((firstSku.sku_price as string) ?? ae.avg_evaluation_rating ?? 0);
                return { itemId, title: String(ae.subject ?? ''), price, currency: 'USD', imageUrl: String(ae.image_url ?? ''), detailUrl: `https://www.aliexpress.com/item/${itemId}.html`, stock: firstSku.sku_stock === true ? undefined : 0 } satisfies SupplierProduct;
        },
  };
}
