'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientEmptyStates, fetchStates, readCache, STATE_EVENT, StateLoadError, writeCache, type ClientNamespace, type ClientStates } from '@/lib/state-client';

export type ServerStatesResult<N extends ClientNamespace> = {
  states: Pick<ClientStates, N>;
  // loading: nothing from the server yet · ready: server data · error: server failed (cache or empty shown)
  status: 'loading' | 'ready' | 'error';
  fromCache: boolean;
  error: string;
  reload: () => void;
};

const localStore = () => { try { return window.localStorage; } catch { return undefined; } };

export function useServerStates<N extends ClientNamespace>(namespaces: readonly N[]): ServerStatesResult<N> {
  const key = namespaces.join('|');
  const empty = Object.fromEntries(namespaces.map(namespace => [namespace, clientEmptyStates[namespace]])) as Pick<ClientStates, N>;
  const [states, setStates] = useState<Pick<ClientStates, N>>(empty);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState('');

  // Only the most recent request may update the screen, so a slow older response never wins.
  const sequence = useRef(0);
  const answered = useRef(false);
  const load = useCallback(() => {
    const request = ++sequence.current;
    const active = () => request === sequence.current;
    const names = key.split('|') as N[];
    fetchStates(names).then(next => {
      if (!active()) return;
      answered.current = true;
      setStates(next); setStatus('ready'); setFromCache(false); setError('');
      const store = localStore();
      Object.entries(next).forEach(([namespace, payload]) => writeCache(namespace as ClientNamespace, payload, store));
    }, cause => {
      if (!active()) return;
      setStatus('error');
      setError(cause instanceof StateLoadError ? `Não foi possível ler o servidor agora (${cause.failed.join(', ')}). Tente novamente.` : 'Não foi possível ler o servidor agora. Tente novamente.');
    });
  }, [key]);

  useEffect(() => {
    // Optional warm start: a valid cached copy paints immediately, then the server replaces it.
    let alive = true;
    const warm = readCache(key.split('|') as N[], localStore());
    void Promise.resolve().then(() => { if (alive && warm && !answered.current) { setStates(warm); setFromCache(true); } });
    load();
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ namespace?: string; payload?: unknown }>).detail;
      if (!detail?.namespace || !key.split('|').includes(detail.namespace)) return;
      // The command response is authoritative; re-read everything to also pick up cross-namespace effects.
      load();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener(STATE_EVENT, onUpdate);
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; sequence.current += 1; window.removeEventListener(STATE_EVENT, onUpdate); document.removeEventListener('visibilitychange', onVisible); };
  }, [key, load]);

  return { states, status, fromCache, error, reload: load };
}
