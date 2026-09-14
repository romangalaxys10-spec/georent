'use client';

/**
 * ExploreView — live multi-source feed orchestrator:
 * - refetches /api/explore (korter + ss + myhome fan-out) whenever filters
 *   change (300ms debounce, abortable);
 * - LIVE status strip: per-source dot (ok/degraded/down), counts, latency,
 *   total matches, fetched-ago ticker — proof the data is live;
 * - List ⇄ Map view toggle (map = Leaflet with price-pill pins, dark tiles);
 * - 1-col mobile / 2-col lg grid of ListingCards with spring entrance,
 *   skeletons on first load, stale list visible during refetches;
 * - "load more" appends via offset pagination, hidden when total reached;
 * - danger error state with Retry, centered empty state with Reset.
 * 'Best deal score' sort is applied client-side (score ships on every listing).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowDown, List, Map as MapIcon, RefreshCw, SearchX } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_FILTERS, type FiltersState, type SortValue } from './filters-panel';
import { ListingCard } from './listing-card';
import { MapView } from './map-view';
import { publishSourceStatuses } from './source-status-store';
import type { ExploreResponse, ScoredListing } from './types';

const PAGE_LIMIT = 20;
const SKELETONS = 8;
/** While the map is open, auto-pull up to this many pages to fill the viewport. */
const MAP_PAGE_CAP = 5;

const SORT_ITEMS: {
  value: SortValue;
  key: 'filters.sortNewest' | 'filters.sortCheapest' | 'filters.sortPpsm' | 'filters.sortScore';
}[] = [
  { value: 'update_time_desc', key: 'filters.sortNewest' },
  { value: 'price_asc', key: 'filters.sortCheapest' },
  { value: 'price_sqm_asc', key: 'filters.sortPpsm' },
  { value: 'score', key: 'filters.sortScore' },
];

const isAbort = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

function buildUrl(f: FiltersState, offset: number): string {
  const sp = new URLSearchParams();
  sp.set('cityId', String(f.cityId));
  if (f.districts.length > 0) sp.set('districts', f.districts.join(','));
  if (f.rooms.length > 0) sp.set('rooms', f.rooms.join(','));
  if (f.bedrooms.length > 0) sp.set('bedrooms', f.bedrooms.join(','));
  if (f.minPrice !== undefined) sp.set('minPrice', String(f.minPrice));
  if (f.maxPrice !== undefined) sp.set('maxPrice', String(f.maxPrice));
  if (f.minArea !== undefined) sp.set('minArea', String(f.minArea));
  if (f.maxArea !== undefined) sp.set('maxArea', String(f.maxArea));
  if (f.minFloor !== undefined) sp.set('minFloor', String(f.minFloor));
  if (f.maxFloor !== undefined) sp.set('maxFloor', String(f.maxFloor));
  if (f.minPpsm !== undefined) sp.set('minPpsm', String(f.minPpsm));
  if (f.maxPpsm !== undefined) sp.set('maxPpsm', String(f.maxPpsm));
  if (f.keyword.trim() !== '') sp.set('keyword', f.keyword.trim());
  if (f.newBuilding) sp.set('newBuilding', '1');
  if (f.hasBalcony) sp.set('hasBalcony', '1');
  if (f.sources.length > 0) sp.set('sources', f.sources.join(','));
  // 'score' is a client-side sort — the API keeps its default order.
  sp.set('sort', f.sort === 'score' ? 'update_time_desc' : f.sort);
  sp.set('offset', String(offset));
  sp.set('limit', String(PAGE_LIMIT));
  return `/api/explore?${sp.toString()}`;
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface" aria-hidden>
      <div className="aspect-[4/3] w-full animate-pulse bg-raised" />
      <div className="flex flex-col gap-2.5 p-4">
        <span className="h-5 w-1/3 animate-pulse rounded bg-raised" />
        <span className="h-3.5 w-2/3 animate-pulse rounded bg-raised" />
        <span className="h-3 w-1/2 animate-pulse rounded bg-raised" />
      </div>
      <div className="border-t border-border px-4 py-2.5">
        <span className="block h-3 w-24 animate-pulse rounded bg-raised" />
      </div>
    </div>
  );
}

/** Per-source status dot in the live strip. */
function SourceDot({ status }: { status: 'ok' | 'degraded' | 'down' }) {
  const cls =
    status === 'ok' ? 'bg-signal' : status === 'degraded' ? 'bg-[#E8A03C]' : 'bg-danger';
  return <span aria-hidden className={`size-[6px] shrink-0 rounded-full ${cls}`} />;
}

export function ExploreView({
  value,
  onChange,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();

  const [items, setItems] = useState<ScoredListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<ExploreResponse['sources']>([]);
  const [total, setTotal] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [hasMore, setHasMore] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const applyResponse = useCallback((data: ExploreResponse, replace: boolean) => {
    setSources(data.sources);
    publishSourceStatuses(data.sources);
    setTotal(data.total);
    setFetchedAt(data.fetchedAt);
    setItems((prev) => {
      const merged = replace ? (data.listings ?? []) : [...prev, ...(data.listings ?? [])];
      // De-dupe by composite key (offset overlaps across pages are possible).
      const seen = new Set<string>();
      const deduped = merged.filter((l) => {
        if (seen.has(l.key)) return false;
        seen.add(l.key);
        return true;
      });
      return valueRef.current.sort === 'score'
        ? [...deduped].sort((a, b) => b.score - a.score)
        : deduped;
    });
  }, []);

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const res = await fetch(buildUrl(valueRef.current, offset), { signal: ctrl.signal });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const msg =
            json !== null && typeof json === 'object' && 'error' in json
              ? String((json as { error: unknown }).error)
              : `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const data = json as ExploreResponse;
        if (ctrl.signal.aborted) return;
        applyResponse(data, replace);
      } catch (err: unknown) {
        if (isAbort(err) || ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [applyResponse],
  );

  // hasMore follows the reported total vs loaded count.
  useEffect(() => {
    setHasMore(items.length > 0 && items.length < total);
  }, [items, total]);

  // Refetch on filter change: immediate on mount, 300ms-debounced afterwards.
  const firstRun = useRef(true);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      void fetchPage(0, true);
      return;
    }
    const id = setTimeout(() => void fetchPage(0, true), 300);
    return () => clearTimeout(id);
  }, [serialized, fetchPage]);

  // Map mode: auto-pull more pages so the viewport fills with pins.
  useEffect(() => {
    if (view !== 'map') return;
    if (total > 0 && items.length < Math.min(total, MAP_PAGE_CAP * PAGE_LIMIT) && !loading) {
      void fetchPage(items.length, false);
    }
     
  }, [view, items.length, total, loading]);

  // Abort any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // "Synced Xs ago" ticker.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const fetchedAgo = (() => {
    if (!fetchedAt) return null;
    const s = Math.max(0, Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000));
    if (s < 60) return t('sources.syncedSeconds', { n: s });
    const m = Math.round(s / 60);
    return t('sources.syncedMinutes', { n: m });
  })();

  const slowest = sources.reduce((max, s) => Math.max(max, s.durationMs), 0);
  const liveTotal = sources.reduce((sum, s) => sum + (s.total ?? 0), 0);

  const showSkeletons = loading && items.length === 0;

  return (
    <section className="flex flex-col gap-4" aria-busy={loading}>
      {/* Toolbar: view toggle + live status + sort */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* List/Map segmented toggle */}
        <div
          className="flex h-9 items-center rounded-md border border-border bg-raised p-0.5"
          role="tablist"
          aria-label={t('sources.viewToggle')}
        >
          {(
            [
              { id: 'list' as const, icon: List, label: t('sources.viewList') },
              { id: 'map' as const, icon: MapIcon, label: t('sources.viewMap') },
            ]
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`flex h-8 items-center gap-1.5 rounded px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                view === id ? 'bg-signal text-[#0B0E0C]' : 'text-muted hover:text-text'
              }`}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {/* Live search status */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2">
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
            <span aria-hidden className="size-[6px] animate-pulse-dot rounded-full bg-signal" />
            {t('sources.live')}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            {sources.map((s) => (
              <span
                key={s.id}
                className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted tnum"
                title={s.error ?? `${s.count} listings · ${Math.round(s.durationMs)}ms`}
              >
                <SourceDot status={s.status} />
                {s.label}
                <span className="text-faint">{s.count}</span>
              </span>
            ))}
          </span>
          {slowest > 0 ? (
            <span className="hidden shrink-0 font-mono text-[10px] text-faint tnum sm:inline">
              {(slowest / 1000).toFixed(1)}s
            </span>
          ) : null}
          {fetchedAgo ? (
            <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] text-faint md:flex">
              <RefreshCw className="size-3" aria-hidden />
              {fetchedAgo}
            </span>
          ) : null}
        </div>

        <Select
          value={value.sort}
          onValueChange={(v) => onChange({ ...value, sort: v as SortValue })}
        >
          <SelectTrigger
            aria-label={t('filters.sort')}
            className="h-9 w-[190px] rounded-md border-border bg-raised font-mono text-[12px] uppercase tracking-[0.06em] text-muted focus-visible:ring-ring/50"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border">
            {SORT_ITEMS.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                className="font-mono text-[12px] uppercase tracking-[0.06em]"
              >
                {t(item.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stale-refresh progress bar (keeps layout animation intact) */}
      {loading && items.length > 0 ? (
        <div className="h-0.5 w-full overflow-hidden rounded bg-raised" aria-hidden>
          <div className="h-full w-1/3 animate-pulse rounded bg-signal" />
        </div>
      ) : null}

      {showSkeletons ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: SKELETONS }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        /* Error state — danger tint + Retry */
        <div className="flex flex-col items-center gap-3 rounded-xl border border-danger/30 bg-danger-dim px-6 py-12 text-center">
          <AlertTriangle className="size-10 text-danger" aria-hidden />
          <p className="text-[14px] text-text">{t('common.error')}</p>
          <p className="max-w-md truncate font-mono text-[11px] text-faint">{error}</p>
          <button
            type="button"
            onClick={() => void fetchPage(0, true)}
            className="mt-1 h-9 rounded-md border border-danger/40 px-4 text-[13px] text-danger transition-colors hover:bg-danger-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : items.length === 0 && !error ? (
        /* Empty state — centered, faint icon, ghost action */
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <SearchX className="size-10 text-faint" aria-hidden />
          <p className="micro text-muted">0 results</p>
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS, cityId: value.cityId })}
            className="mt-1 h-9 rounded-md border border-border px-4 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {t('filters.reset')}
          </button>
        </div>
      ) : view === 'map' ? (
        <MapView items={items} />
      ) : (
        <>
          <motion.div layout className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {items.map((l, i) => (
                <motion.div
                  key={l.key}
                  layout
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, scale: 0.98 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 34,
                    delay: Math.min(i * 0.04, 0.32),
                  }}
                >
                  <ListingCard listing={l} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* Inline error banner when a stale list is on screen */}
          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-dim px-4 py-3">
              <p className="min-w-0 truncate font-mono text-[12px] text-danger">
                {t('common.error')} — {error}
              </p>
              <button
                type="button"
                onClick={() => void fetchPage(0, true)}
                className="shrink-0 rounded-md border border-danger/40 px-3 py-1.5 text-[12px] text-danger transition-colors hover:bg-danger-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : null}

          {/* Load more — mono ghost, hidden when the total is reached */}
          {hasMore && !error ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void fetchPage(items.length, false)}
              className="micro mx-auto flex h-9 items-center gap-2 rounded-md border border-border bg-transparent px-4 text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
              {loadingMore ? (
                `${t('common.loading')}…`
              ) : (
                <>
                  {t('common.loadMore')}
                  <ArrowDown className="size-3" aria-hidden />
                </>
              )}
            </button>
          ) : (
            <p className="micro text-center text-faint tnum">
              {items.length} / {liveTotal > 0 ? liveTotal.toLocaleString(locale) : total}
            </p>
          )}
        </>
      )}
    </section>
  );
}
