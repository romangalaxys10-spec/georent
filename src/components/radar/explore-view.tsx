'use client';

/**
 * ExploreView — the feed orchestrator per design.md §5/§6/§7 + motion rules:
 * - refetches /api/explore whenever filters change (300ms debounce, abortable);
 * - 1-col mobile / 2-col lg grid of ListingCards with spring entrance
 *   (0.04s stagger, 8px rise) and layout animation on filter change;
 * - 8 exact-geometry skeleton cards on first load, stale list stays visible
 *   (with a thin signal progress bar) during refetches;
 * - "load more" appends via offset pagination, hides when a short page returns;
 * - danger-tinted error state with Retry, centered empty state with Reset.
 * 'Best deal score' sort is applied client-side (score ships on every listing).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowDown, SearchX } from 'lucide-react';

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
import type { ExploreResponse, ScoredListing } from './types';

const PAGE_LIMIT = 20;
const SKELETONS = 8;

const SORT_ITEMS: {
  value: SortValue;
  key: 'filters.sortNewest' | 'filters.sortCheapest' | 'filters.sortPpsm' | 'filters.sortPriceDrop';
}[] = [
  { value: 'update_time_desc', key: 'filters.sortNewest' },
  { value: 'price_asc', key: 'filters.sortCheapest' },
  { value: 'price_sqm_asc', key: 'filters.sortPpsm' },
  { value: 'score', key: 'filters.sortPriceDrop' },
];

const isAbort = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

function buildUrl(f: FiltersState, offset: number): string {
  const sp = new URLSearchParams();
  sp.set('cityId', String(f.cityId));
  if (f.districts.length > 0) sp.set('districts', f.districts.join(','));
  if (f.rooms.length > 0) sp.set('rooms', f.rooms.join(','));
  if (f.minPrice !== undefined) sp.set('minPrice', String(f.minPrice));
  if (f.maxPrice !== undefined) sp.set('maxPrice', String(f.maxPrice));
  if (f.minArea !== undefined) sp.set('minArea', String(f.minArea));
  if (f.maxArea !== undefined) sp.set('maxArea', String(f.maxArea));
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

export function ExploreView({
  value,
  onChange,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();

  const [items, setItems] = useState<ScoredListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const fetchPage = useCallback(async (offset: number, replace: boolean) => {
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
      const page = data.listings ?? [];
      setHasMore(page.length >= PAGE_LIMIT);
      setItems((prev) => {
        const merged = replace ? page : [...prev, ...page];
        return valueRef.current.sort === 'score'
          ? [...merged].sort((a, b) => b.score - a.score)
          : merged;
      });
    } catch (err: unknown) {
      if (isAbort(err) || ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

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

  // Abort any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const showSkeletons = loading && items.length === 0;

  return (
    <section className="flex flex-col gap-4" aria-busy={loading}>
      {/* Feed toolbar — sort select, localized labels */}
      <div className="flex items-center justify-end">
        <Select
          value={value.sort}
          onValueChange={(v) => onChange({ ...value, sort: v as SortValue })}
        >
          <SelectTrigger
            aria-label={t('filters.sort')}
            className="h-9 w-[210px] rounded-md border-border bg-raised font-mono text-[12px] uppercase tracking-[0.06em] text-muted focus-visible:ring-ring/50"
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
      ) : (
        <>
          <motion.div layout className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {items.map((l, i) => (
                <motion.div
                  key={l.objectId}
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

          {/* Load more — mono ghost, hidden when the last page is short */}
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
                  Load more
                  <ArrowDown className="size-3" aria-hidden />
                </>
              )}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
