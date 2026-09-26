// Browser side of the command API. The server validates and applies the rule, then returns the
// authoritative state, which is mirrored into the local read cache that the workspaces render from.
const cache: Record<string, [storageKey: string, eventName: string]> = {
  intake: ['ddf.intake.demo.v1', 'ddf-intake-change'],
  products: ['ddf.products.demo.v1', 'ddf-products-change'],
  media: ['ddf.media.demo.v1', 'ddf-media-change'],
  pricing: ['ddf.pricing.demo.v1', 'ddf-pricing-change'],
  orders: ['ddf.orders.demo.v1', 'ddf-orders-change'],
  catalog: ['ddf.catalog.demo.v1', 'ddf-catalog-change'],
};

export type Command = { type: string; input: Record<string, unknown> };
export const command = (type: string, input: Record<string, unknown> = {}): Command => ({ type, input });

export async function sendCommand({ type, input }: Command): Promise<void> {
  const response = await fetch('/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, input }) });
  const body = await response.json().catch(() => ({})) as { error?: string; namespace?: string; payload?: unknown };
  if (!response.ok) throw new Error(body.error || `Operação recusada pelo servidor (HTTP ${response.status}).`);
  const target = body.namespace ? cache[body.namespace] : undefined;
  if (target && body.payload) {
    try { localStorage.setItem(target[0], JSON.stringify(body.payload)); } catch { /* cache is best effort */ }
    window.dispatchEvent(new Event(target[1]));
    // Server-backed screens take the authoritative payload directly, without going through the cache.
    window.dispatchEvent(new CustomEvent('ddf-state-update', { detail: { namespace: body.namespace, payload: body.payload } }));
  }
}

export function errorMessage(value: unknown, fallback = 'Não foi possível concluir.') {
  return value instanceof Error ? value.message : fallback;
}
