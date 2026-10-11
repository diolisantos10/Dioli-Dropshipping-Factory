/** Access policy is provider-specific; the investigation loop is provider-independent. */
export type SupplierPageTarget = { itemId: string; url: string; title?: string; variants?: { sku: string; label?: string }[] };
export type SupplierPageAccess = { provider: string; allowedHosts: string[]; productPathPattern: string };
// Only this access adapter is connected. Other marketplaces require their own tested adapter.
export const aliexpressPageAccess: SupplierPageAccess = {
  provider: 'aliexpress', allowedHosts: ['aliexpress.com', 'alicdn.com', 'aliexpress-media.com'], productPathPattern: '^/item/(\\d+)\\.html$',
};
export function supplierPageUrl(itemId: string) {
  if (!/^\d{1,30}$/.test(itemId)) throw new Error('supplier_page_invalid_item');
  return `https://pt.aliexpress.com/item/${itemId}.html`;
}
export function allowedSupplierResource(url: string, access: SupplierPageAccess) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && access.allowedHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)); }
  catch { return false; }
}
export function targetSupplierPage(url: string, target: SupplierPageTarget, access: SupplierPageAccess) {
  return allowedSupplierResource(url, access) && new RegExp(access.productPathPattern).exec(new URL(url).pathname)?.[1] === target.itemId;
}
