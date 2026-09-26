// Reads factory state straight from the server (GET /api/state/:namespace). The server is the only
// source of truth; localStorage is an optional warm cache for the first paint and is never trusted:
// a missing, stale, oversized or malformed cache entry is ignored instead of blocking the screen.
import { emptyCatalog, type CatalogState } from './catalog.ts';
import { emptyIntake, type IntakeState } from './intake.ts';
import { emptyMedia, type MediaState } from './media-factory.ts';
import { emptyPricing, type PricingState } from './pricing.ts';
import { emptyProductFactory, type ProductFactoryState } from './product-factory.ts';

export type ClientStates = { intake: IntakeState; products: ProductFactoryState; media: MediaState; pricing: PricingState; catalog: CatalogState };
export type ClientNamespace = keyof ClientStates;

export const clientEmptyStates: ClientStates = { intake: emptyIntake, products: emptyProductFactory, media: emptyMedia, pricing: emptyPricing, catalog: emptyCatalog };
export const CACHE_KEYS: Record<ClientNamespace, string> = {
  intake: 'ddf.intake.demo.v1', products: 'ddf.products.demo.v1', media: 'ddf.media.demo.v1', pricing: 'ddf.pricing.demo.v1', catalog: 'ddf.catalog.demo.v1',
};
export const STATE_EVENT = 'ddf-state-update';

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const arrays: Record<ClientNamespace, string[]> = {
  intake: ['candidates', 'events'], products: ['products', 'events'], media: ['assets'], pricing: ['calculations'], catalog: ['brands', 'stores', 'offers', 'assignments'],
};

// Structural check only: the shape each screen needs. Version numbers are not compared, so a
// schema bump on the server (e.g. media v2) can no longer blank a screen.
export function normalizeState<N extends ClientNamespace>(namespace: N, payload: unknown): ClientStates[N] | null {
  if (payload === null || payload === undefined) return clientEmptyStates[namespace];
  if (!isObject(payload)) return null;
  const empty = clientEmptyStates[namespace] as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...empty, ...payload };
  for (const key of arrays[namespace]) {
    if (merged[key] === undefined) merged[key] = [];
    if (!Array.isArray(merged[key])) return null;
  }
  return merged as unknown as ClientStates[N];
}

export class StateLoadError extends Error {
  readonly failed: ClientNamespace[];
  constructor(failed: ClientNamespace[]) { super(`Servidor indisponível para: ${failed.join(', ')}.`); this.failed = failed; }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export async function fetchStates<N extends ClientNamespace>(namespaces: readonly N[], fetcher: Fetcher = fetch): Promise<Pick<ClientStates, N>> {
  const failed: ClientNamespace[] = [];
  const entries = await Promise.all(namespaces.map(async (namespace) => {
    try {
      const response = await fetcher(`/api/state/${namespace}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const body = await response.json() as { payload?: unknown };
      const state = normalizeState(namespace, body.payload);
      if (!state) throw new Error();
      return [namespace, state] as const;
    } catch { failed.push(namespace); return [namespace, clientEmptyStates[namespace]] as const; }
  }));
  if (failed.length) throw new StateLoadError(failed);
  return Object.fromEntries(entries) as Pick<ClientStates, N>;
}

type CacheStore = Pick<Storage, 'getItem' | 'setItem'>;
export function readCache<N extends ClientNamespace>(namespaces: readonly N[], store: CacheStore | undefined): Pick<ClientStates, N> | null {
  try {
    if (!store) return null;
    const result: Partial<ClientStates> = {};
    for (const namespace of namespaces) {
      const raw = store.getItem(CACHE_KEYS[namespace]);
      if (!raw) return null;
      const state = normalizeState(namespace, JSON.parse(raw));
      if (!state) return null;
      (result as Record<string, unknown>)[namespace] = state;
    }
    return result as Pick<ClientStates, N>;
  } catch { return null; }
}
export function writeCache(namespace: ClientNamespace, payload: unknown, store: CacheStore | undefined) {
  try { store?.setItem(CACHE_KEYS[namespace], JSON.stringify(payload)); } catch { /* quota or privacy mode: cache is optional */ }
}
