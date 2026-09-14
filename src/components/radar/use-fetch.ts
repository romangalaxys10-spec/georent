'use client';

/**
 * useFetch — minimal client-side JSON fetch hook (no dependencies).
 *
 *   const { data, error, loading, refetch } = useFetch<Stats>('/api/stats?cityId=1');
 *
 * - Aborts in-flight requests on url change / unmount (AbortController).
 * - `refreshKey` re-runs the fetch when it changes (e.g. cache-busting nonce).
 * - `refetch()` forces a re-run for the same url (Retry buttons).
 * - Non-2xx responses parse `{error}` from the body when available.
 * - `url === null` idles (no fetch, loading false) — handy for deferred loads.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type UseFetchResult<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
};

const isAbort = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

export function useFetch<T>(
  url: string | null,
  options?: { refreshKey?: string | number },
): UseFetchResult<T> {
  const { refreshKey } = options ?? {};
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (url === null) {
      // Deferred to a microtask: keeps the effect free of synchronous
      // setState (react-hooks/set-state-in-effect) while still flipping the
      // flag before the next paint.
      queueMicrotask(() => setLoading(false));
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            json !== null &&
            typeof json === 'object' &&
            'error' in json &&
            typeof (json as { error: unknown }).error === 'string'
              ? (json as { error: string }).error
              : `HTTP ${res.status}`;
          throw new Error(message);
        }
        return json as T;
      })
      .then((parsed) => {
        if (ctrl.signal.aborted) return;
        setData(parsed);
        setError(null);
      })
      .catch((err: unknown) => {
        if (isAbort(err) || ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [url, refreshKey, tick]);

  return { data, error, loading, refetch };
}
