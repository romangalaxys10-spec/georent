/**
 * Detail micro-cache — makes offer sub-pages load instantly instead of
 * staring at a skeleton for 5-15s while the source site is scraped.
 *
 * Contract (unchanged): data is live-synced with the source. The cache only
 * smooths the window BETWEEN syncs:
 *   - TTL 45s: the client's 60s auto-sync still always reaches the source;
 *   - `fresh=1` (manual "Sync now") always bypasses;
 *   - in-flight dedup: concurrent views of the same offer share one scrape
 *     (kinder to korter/ss/myhome, no thundering herd);
 *   - stale-while-error: if the source hiccups, the last good copy is served
 *     (flagged `stale`) instead of a 502 — the page never looks broken.
 *
 * Also exposes `readDetailCache` for the server component: on a cache hit the
 * offer shell is server-rendered with real content (no client skeleton at
 * all). On a miss the client fetch path takes over as before.
 */
import type { UnifiedDetail } from './index';

export type CachedDetailPayload = UnifiedDetail & {
  tracked?: {
    previousPriceUsd?: number;
    minPriceUsd?: number;
    priceDrops?: number;
    firstSeenAt?: string;
  };
};

export type CachedDetail = {
  payload: CachedDetailPayload;
  storedAt: number;
};

type CacheEntry = CachedDetail & { hint?: string };

const TTL_MS = 45_000;
const MAX_ENTRIES = 300;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CachedDetail>>();

const cacheKey = (provider: string, id: string) => `${provider}:${id}`;

function prune() {
  if (cache.size <= MAX_ENTRIES) return;
  // Map preserves insertion order → evict oldest first.
  for (const k of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break;
    cache.delete(k);
  }
}

/** Pure cache read — no network, safe to call from the server component. */
export function readDetailCache(
  provider: string,
  id: string,
): CachedDetail | null {
  const hit = cache.get(cacheKey(provider, id));
  if (!hit) return null;
  // Refresh LRU recency.
  cache.delete(cacheKey(provider, id));
  cache.set(cacheKey(provider, id), hit);
  return { payload: hit.payload, storedAt: hit.storedAt };
}

export function peekDetailCacheAge(provider: string, id: string): number | null {
  const hit = cache.get(cacheKey(provider, id));
  return hit ? Date.now() - hit.storedAt : null;
}

/**
 * Merge tracking data (computed by the API route on source hits) back into
 * the cached payload so cache hits keep the price-drop/lowest-seen badges.
 */
export function patchDetailCache(
  provider: string,
  id: string,
  patch: { tracked?: CachedDetailPayload['tracked'] },
): void {
  const key = cacheKey(provider, id);
  const hit = cache.get(key);
  if (!hit) return;
  cache.set(key, { ...hit, payload: { ...hit.payload, ...patch } });
}

/**
 * Fetch offer detail through the micro-cache. `fresh` bypasses the TTL
 * (manual sync). On upstream failure serves the last good copy (even
 * expired) flagged `stale: true`; rethrows only when nothing is cached.
 */
export async function fetchDetailCached(
  provider: 'korter' | 'ss' | 'myhome',
  id: string,
  opts: { hint?: string; fresh?: boolean } = {},
): Promise<CachedDetail & { fromCache: boolean; stale: boolean }> {
  const key = cacheKey(provider, id);
  const hit = cache.get(key);

  if (!opts.fresh && hit && Date.now() - hit.storedAt < TTL_MS) {
    // LRU refresh.
    cache.delete(key);
    cache.set(key, hit);
    return { ...hit, fromCache: true, stale: false };
  }

  const pending = inflight.get(key);
  if (pending) return { ...(await pending), fromCache: true, stale: false };

  const job = (async (): Promise<CachedDetail> => {
    const { fetchUnifiedDetail } = await import('./index');
    const payload = await fetchUnifiedDetail(provider, id, opts.hint);
    const entry: CacheEntry = { payload, storedAt: Date.now(), hint: opts.hint };
    cache.set(key, entry);
    prune();
    return entry;
  })();

  inflight.set(key, job);
  try {
    return { ...(await job), fromCache: false, stale: false };
  } catch (err) {
    // Stale-while-error: better a slightly old offer than a broken page.
    if (hit) return { ...hit, fromCache: true, stale: true };
    throw err;
  } finally {
    inflight.delete(key);
  }
}
