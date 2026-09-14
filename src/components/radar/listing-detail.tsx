'use client';

/**
 * ListingDetail — the dedicated offer page.
 *
 * Real-time sync contract: the component fetches /api/listing/[provider]/[id]
 * on mount and re-syncs with the source site every 60s while the tab is
 * visible (plus a manual "Sync now" button). Every payload is fresh from the
 * source network — the "Synced Xs ago" ticker makes that visible.
 *
 * Layout: photo gallery (main + thumb rail, keyboard nav) · price panel
 * (USD + native, ppsm, price-drop / lowest-seen tracking) · market ppsm
 * sparkline (12 months, tnet sources) · parameter grid · sanitized
 * description · seller card · source CTA + copy link · cross-listed chips.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Layers,
  Link2,
  RefreshCw,
  TrendingDown,
} from 'lucide-react';

import { formatPrice, useI18n } from '@/lib/i18n';
import type { UnifiedDetail } from '@/lib/providers/index';

type DetailPayload = UnifiedDetail & {
  tracked?: {
    previousPriceUsd?: number;
    minPriceUsd?: number;
    priceDrops?: number;
    firstSeenAt?: string;
  };
  cached?: boolean;
  stale?: boolean;
};

const SYNC_INTERVAL_MS = 60_000;
const SESSION_PREFIX = 'dealradar-detail:';

/** Last-good payload per offer for instant paint on back-nav/reload. */
function readSessionDetail(key: string): DetailPayload | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DetailPayload;
    return parsed && typeof parsed === 'object' && parsed.listing ? parsed : null;
  } catch {
    return null; // private mode / quota — paint is just slower, never broken
  }
}

function writeSessionDetail(key: string, payload: DetailPayload) {
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(payload));
    // Bound quota: keep at most 8 offer payloads per session.
    const ours: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) ours.push(k);
    }
    while (ours.length > 8) {
      const drop = ours.shift();
      if (drop) sessionStorage.removeItem(drop);
    }
  } catch {
    /* ignore */
  }
}

const PROVIDER_LABEL: Record<string, string> = {
  korter: 'Korter',
  ss: 'SS.ge',
  myhome: 'MyHome',
};

/** Strip source HTML down to safe plain text with line breaks. */
function sanitizeDescription(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 12-month market ppsm sparkline (inline SVG, no deps). */
function Sparkline({ data, current }: { data: { date: string; avgPpsmUsd: number }[]; current: number }) {
  const { t, locale } = useI18n();
  if (data.length < 2) return null;
  const W = 560;
  const H = 120;
  const pad = 6;
  const values = data.map((d) => d.avgPpsmUsd);
  if (current > 0) values.push(current);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.avgPpsmUsd).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - pad} L${pad},${H - pad} Z`;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" role="img" aria-label={t('detail.priceHistory')}>
        <path d={area} fill="var(--signal)" opacity={0.08} />
        <path d={line} fill="none" stroke="var(--signal)" strokeWidth={1.8} strokeLinejoin="round" />
        <line x1={pad} x2={W - pad} y1={y(avg)} y2={y(avg)} stroke="#E8A03C" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
        {current > 0 ? (
          <circle
            cx={x(data.length - 1)}
            cy={y(data[data.length - 1].avgPpsmUsd)}
            r={3.5}
            fill="#E7ECE9"
            stroke="var(--signal)"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>
      <div dir="ltr" className="mt-1 flex items-center justify-between font-mono text-[10px] text-faint tnum">
        <span>
          {t('detail.marketAvg')}: {formatPrice(Math.round(avg), locale)}/m²
        </span>
        <span>
          {data[0].date} → {data[data.length - 1].date}
        </span>
      </div>
    </div>
  );
}

function ParamCell({ label, value }: { label: string; value: string | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="rounded-lg border border-border bg-raised px-3 py-2.5">
      <div className="micro text-faint">{label}</div>
      <div className="mt-1 font-mono text-[13px] text-text tnum">{value}</div>
    </div>
  );
}

export function ListingDetail({
  provider,
  id,
  initialDetail = null,
}: {
  provider: string;
  id: string;
  /** SSR fast path: server micro-cache hit → paint real content instantly. */
  initialDetail?: DetailPayload | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlHint = searchParams.get('url') ?? undefined;

  const [data, setData] = useState<DetailPayload | null>(initialDetail);
  const [loading, setLoading] = useState(initialDetail === null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);

  const syncRef = useRef<() => void>(() => {});
  const syncedAtRef = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const hasDataRef = useRef(initialDetail !== null);
  const photoCount = data?.photos.length ?? 0;

  const load = useCallback(
    async (mode: 'initial' | 'auto' | 'manual') => {
      if (mode !== 'initial') setSyncing(true);
      setError(null);
      try {
        // Instant paint from sessionStorage while revalidating (first visit
        // in this tab, no SSR cache hit). Skeleton only on true cold loads.
        if (mode === 'initial' && !hasDataRef.current) {
          const cached = readSessionDetail(`${provider}:${id}`);
          if (cached) {
            setData(cached);
            setLoading(false);
            setSyncing(true);
            setPhotoIdx(0);
          }
        }
        // Only the explicit "Sync now" button bypasses the server micro-cache;
        // initial + 60s auto syncs stay cache-eligible (TTL 45s < 60s, so the
        // source is still reached on every scheduled refresh).
        const fresh = mode === 'manual' ? 'fresh=1' : '';
        const qs = urlHint
          ? `?url=${encodeURIComponent(urlHint)}${fresh ? `&${fresh}` : ''}`
          : fresh
            ? `?${fresh}`
            : '';
        const res = await fetch(`/api/listing/${provider}/${id}${qs}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok || json === null || typeof json !== 'object') {
          throw new Error(res.status === 404 ? 'not_found' : `HTTP ${res.status}`);
        }
        const payload = json as DetailPayload;
        if ('error' in payload) throw new Error(String(payload.error));
        setData(payload);
        hasDataRef.current = true;
        writeSessionDetail(`${provider}:${id}`, payload);
        const now = Date.now();
        setSyncedAt(now);
        syncedAtRef.current = now;
        setPhotoIdx((i) => (payload.photos.length > 0 ? Math.min(i, payload.photos.length - 1) : 0));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [provider, id, urlHint],
  );

  syncRef.current = () => void load('manual');

  // Initial load + auto-sync loop (visible tabs only).
  useEffect(() => {
    void load('initial');
    const id2 = setInterval(() => {
      if (document.visibilityState === 'visible') void load('auto');
    }, SYNC_INTERVAL_MS);
    const onVisible = () => {
      const at = syncedAtRef.current;
      if (document.visibilityState === 'visible' && at && Date.now() - at > SYNC_INTERVAL_MS) {
        void load('auto');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id2);
      document.removeEventListener('visibilitychange', onVisible);
    };
     
  }, [load]);

  // "Synced Xs ago" ticker (15s resolution).
  useEffect(() => {
    const id2 = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id2);
  }, []);

  // SSR cache-hit path: derive honest sync age from the payload itself.
  useEffect(() => {
    if (initialDetail?.syncedAt) {
      const at = Date.parse(initialDetail.syncedAt);
      if (Number.isFinite(at)) {
        setSyncedAt(at);
        syncedAtRef.current = at;
      }
    }
  }, [initialDetail]);

  // Gallery keyboard nav.
  useEffect(() => {
    if (photoCount < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPhotoIdx((i) => (i + 1) % photoCount);
      if (e.key === 'ArrowLeft') setPhotoIdx((i) => (i - 1 + photoCount) % photoCount);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photoCount]);

  const syncedAgo = useMemo(() => {
    if (!syncedAt) return null;
    const s = Math.max(0, Math.round((Date.now() - syncedAt) / 1000));
    if (s < 5) return t('detail.syncedJustNow');
    if (s < 60) return t('sources.syncedSeconds', { n: s });
    return t('sources.syncedMinutes', { n: Math.round(s / 60) });
     
  }, [syncedAt, tick, t]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }, []);

  // Gallery touch swipe (mobile): horizontal fling advances the photo.
  const onGalleryTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onGalleryTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null || photoCount < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) < 40) return;
    setPhotoIdx((i) => (dx < 0 ? (i + 1) % photoCount : (i - 1 + photoCount) % photoCount));
  };

  // --- States ---
  if (notFound) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-raised font-mono text-[18px] text-faint">–</span>
        <h1 className="text-[18px] font-semibold text-text">{t('detail.notFound')}</h1>
        <p className="text-[14px] text-muted">{t('detail.notFoundBody')}</p>
        <Link
          href="/"
          className="mt-2 flex h-10 items-center gap-2 rounded-md border border-border px-4 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('detail.backToFeed')}
        </Link>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-5 lg:px-8">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-raised" />
            <div className="flex gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className="h-16 w-24 shrink-0 animate-pulse rounded-lg bg-raised" />
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <span className="h-8 w-1/2 animate-pulse rounded bg-raised" />
            <span className="h-4 w-1/3 animate-pulse rounded bg-raised" />
            <span className="h-32 w-full animate-pulse rounded-xl bg-raised" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="font-mono text-[12px] text-danger">{t('common.error')} — {error}</p>
        <button
          type="button"
          onClick={() => void load('manual')}
          className="h-9 rounded-md border border-danger/40 px-4 text-[13px] text-danger transition-colors hover:bg-danger-dim"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (!data) return null;

  const l = data.listing;
  const site = PROVIDER_LABEL[l.provider] ?? l.provider;
  const description = data.descriptionHtml ? sanitizeDescription(data.descriptionHtml) : null;
  const priceDrop = data.tracked?.previousPriceUsd;
  const drops = data.tracked?.priceDrops ?? 0;
  const lowest = data.tracked?.minPriceUsd;
  const sellerTypeLabel =
    data.seller?.type === 'owner'
      ? t('detail.owner')
      : data.seller?.type === 'developer'
        ? t('detail.developer')
        : t('detail.agency');

  const params: { label: string; value: string | null | undefined }[] = [
    { label: t('filters.rooms'), value: l.roomCount > 0 ? String(l.roomCount) : null },
    { label: t('filters.area'), value: l.area > 0 ? `${Math.round(l.area * 10) / 10} m²` : null },
    { label: t('filters.bedrooms'), value: l.bedrooms ? String(l.bedrooms) : null },
    { label: t('detail.bathrooms'), value: data.params.bathroomCount ? String(data.params.bathroomCount) : null },
    {
      label: t('filters.floor'),
      value:
        typeof l.floor === 'number' && l.floor > 0
          ? typeof l.floorCount === 'number' && l.floorCount > 0
            ? `${l.floor} / ${l.floorCount}`
            : String(l.floor)
          : null,
    },
    { label: t('detail.condition'), value: data.params.condition },
    { label: t('detail.buildYear'), value: data.params.buildYear ? String(data.params.buildYear) : null },
    {
      label: t('detail.balcony'),
      value: data.params.balconies ? t('detail.yes') : l.provider === 'ss' || l.provider === 'myhome' ? t('detail.no') : null,
    },
    {
      label: t('detail.ceiling'),
      value: data.params.ceilingHeight ? `${data.params.ceilingHeight} m` : null,
    },
    {
      label: t('detail.kitchen'),
      value: data.params.kitchenArea ? `${Math.round(data.params.kitchenArea)} m²` : null,
    },
    {
      label: t('detail.living'),
      value: data.params.livingArea ? `${Math.round(data.params.livingArea)} m²` : null,
    },
    { label: t('detail.published'), value: data.createdAt ? new Date(data.createdAt).toLocaleDateString(locale) : null },
  ].filter((p) => p.value);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-32 pt-5 sm:px-5 lg:px-8 lg:pb-8">
      {/* Top bar: back + live sync status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t('detail.backToFeed')}
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
            <span aria-hidden className="size-[6px] shrink-0 animate-pulse-dot rounded-full bg-signal" />
            <span className="truncate">
              {t('detail.liveSync')}
              {syncedAgo ? <span className="text-faint normal-case tracking-normal">· {syncedAgo}</span> : null}
            </span>
          </span>
          <button
            type="button"
            onClick={() => syncRef.current()}
            disabled={syncing}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted transition-colors hover:border-signal/50 hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
            {syncing ? t('detail.syncing') : t('detail.syncNow')}
          </button>
        </div>
      </div>
      <p className="micro mt-2 text-faint">{t('detail.autoSync')}</p>

      {/*
        Grid: mobile = one minmax(0,1fr) column in DOM order (gallery →
        price/params/seller → description); lg = 2 columns with the right
        column spanning both rows. minmax(0,…) + min-w-0 are CRITICAL — bare
        tracks size to the photo's intrinsic width and blow the viewport out
        horizontally on phones (the original mobile-hostility bug).
      */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-6">
        {/* Gallery — col 1 / row 1 */}
        <section aria-label={t('detail.offer')} className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div
            className="relative overflow-hidden rounded-xl border border-border bg-raised"
            onTouchStart={onGalleryTouchStart}
            onTouchEnd={onGalleryTouchEnd}
          >
            {data.photos[photoIdx] ? (
              <img
                src={data.photos[photoIdx].large}
                alt={`${l.title} — ${photoIdx + 1}/${photoCount}`}
                className="aspect-[4/3] w-full max-w-full object-cover"
                decoding="async"
              />
            ) : l.image ? (
              <img src={l.image} alt={l.title} className="aspect-[4/3] w-full max-w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center text-faint">—</div>
            )}
            {photoCount > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="previous photo"
                  onClick={() => setPhotoIdx((i) => (i - 1 + photoCount) % photoCount)}
                  className="absolute start-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#0B0E0C]/70 text-text backdrop-blur-sm transition-colors hover:bg-[#0B0E0C]/90"
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="next photo"
                  onClick={() => setPhotoIdx((i) => (i + 1) % photoCount)}
                  className="absolute end-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#0B0E0C]/70 text-text backdrop-blur-sm transition-colors hover:bg-[#0B0E0C]/90"
                >
                  <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
                </button>
                <span dir="ltr" className="absolute bottom-2 end-2 rounded-md bg-[#0B0E0C]/70 px-2 py-0.5 font-mono text-[10px] text-text tnum backdrop-blur-sm">
                  {photoIdx + 1} / {photoCount}
                </span>
              </>
            ) : null}
            {/* Source chip */}
            <span className="absolute start-2 top-2 flex items-center gap-1.5 rounded-md bg-[#0B0E0C]/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text backdrop-blur-sm">
              {site}
            </span>
          </div>

          {/* Thumb rail */}
          {photoCount > 1 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {data.photos.map((p, i) => (
                <button
                  key={p.large + i}
                  type="button"
                  aria-label={`photo ${i + 1}`}
                  aria-current={i === photoIdx}
                  onClick={() => setPhotoIdx(i)}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                    i === photoIdx ? 'border-signal' : 'border-border opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={p.thumb ?? p.large} alt="" className="size-full max-w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {/* Price · title · parameters · seller · actions — col 2, spans both rows on lg.
            On mobile it lands directly under the gallery (price first, description last). */}
        <section
          className={`flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1 ${
            description ? 'lg:row-span-2' : ''
          }`}
        >
          {/* Price panel */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[28px] font-semibold leading-none tracking-[-0.01em] text-text tnum">
                  {formatPrice(l.priceUsd, locale)}
                </div>
                {l.currency === 'GEL' ? (
                  <div className="mt-1.5 font-mono text-[12px] text-muted tnum">
                    ≈ {formatPrice(Math.round(l.priceNative), locale)} GEL
                  </div>
                ) : null}
                <div className="mt-1.5 font-mono text-[13px] text-muted tnum">
                  {l.ppsmUsd > 0 ? `${formatPrice(Math.round(l.ppsmUsd), locale)} ${t('listing.perm2')}` : '—'}
                </div>
              </div>
              {priceDrop ? (
                <span className="flex items-center gap-1 rounded-md bg-danger-dim px-2 py-1 font-mono text-[11px] font-semibold text-danger">
                  <TrendingDown className="size-3.5" aria-hidden />
                  {t('detail.priceDropNow', { n: Math.round(priceDrop - l.priceUsd).toLocaleString('en-US') })}
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-faint tnum">
              {lowest !== undefined && lowest > 0 ? (
                <span>
                  {t('detail.lowestSeen')}: {formatPrice(Math.round(lowest), locale)}
                </span>
              ) : null}
              {drops > 0 ? <span>{t('detail.priceDrops', { n: drops })}</span> : null}
              {data.views !== undefined ? (
                <span className="flex items-center gap-1">
                  <Eye className="size-3" aria-hidden />
                  {t('detail.views', { n: data.views.toLocaleString('en-US') })}
                </span>
              ) : null}
              <span>
                {t('detail.listingId')}: {l.objectId}
              </span>
            </div>

            {/* Market ppsm sparkline */}
            {data.priceHistory && data.priceHistory.length > 2 ? (
              <div className="mt-4 border-t border-border pt-3">
                <div className="micro text-faint">{t('detail.priceHistory')}</div>
                <Sparkline data={data.priceHistory} current={l.ppsmUsd} />
              </div>
            ) : null}
          </div>

          {/* Title + place */}
          <div>
            <h1 className="text-[17px] font-semibold leading-snug text-text">{l.title}</h1>
            <p className="mt-1 text-[13px] text-muted">
              {[l.districtName, l.cityName, l.address].filter(Boolean).join(' · ')}
            </p>
            {(l.alsoOn?.length ?? 0) > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
                <Layers className="size-3" aria-hidden />
                {t('detail.crossListed')}{' '}
                {l.alsoOn!.map((p) => PROVIDER_LABEL[p] ?? p).join(', ')}
              </p>
            ) : null}
          </div>

          {/* Parameters */}
          {params.length > 0 ? (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="micro text-muted">{t('detail.parameters')}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {params.map((p) => (
                  <ParamCell key={p.label} label={p.label} value={p.value} />
                ))}
              </div>
            </div>
          ) : null}

          {/* Seller */}
          {data.seller?.name || data.seller?.phone ? (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="micro text-muted">{t('detail.seller')}</h2>
              <div className="mt-3 flex items-center gap-3">
                {data.seller.logo ? (
                  <img
                    src={data.seller.logo}
                    alt=""
                    className="size-11 rounded-full border border-border object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex size-11 items-center justify-center rounded-full bg-raised">
                    <Building2 className="size-5 text-faint" aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-text">
                    {data.seller.name ?? '—'}
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
                    {sellerTypeLabel}
                  </div>
                </div>
              </div>
              {data.seller.phone ? (
                <div className="mt-3 rounded-lg border border-border bg-raised px-3 py-2.5 font-mono text-[14px] tracking-[0.06em] text-text tnum">
                  {data.seller.phone}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <a
              href={l.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center justify-center gap-2 rounded-md bg-signal font-medium text-[14px] text-[#0B0E0C] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t('detail.viewOnSource', { site })}
              <ArrowUpRight className="size-4 rtl:rotate-180" aria-hidden />
            </a>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-transparent text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {copied ? (
                <Check className="size-4 text-signal" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied ? t('detail.copied') : t('detail.copyLink')}
              <Link2 className="size-3 text-faint" aria-hidden />
            </button>
          </div>
        </section>

        {/* Description — its own grid item: last on mobile, under the gallery on lg */}
        {description ? (
          <section className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5 lg:col-start-1 lg:row-start-2">
            <h2 className="micro text-muted">{t('detail.description')}</h2>
            <div className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-text">
              {description}
            </div>
          </section>
        ) : null}
      </div>

      {/* Sticky mobile action bar — price + source CTA stay reachable while scrolling */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-[#0B0E0C]/95 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex w-full max-w-[1100px] items-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),0.625rem)] pt-2.5">
          <div className="min-w-0">
            <div className="truncate font-mono text-[17px] font-semibold leading-none text-text tnum">
              {formatPrice(l.priceUsd, locale)}
            </div>
            <div className="micro mt-1 truncate text-faint">
              {site}
              {l.ppsmUsd > 0 ? ` · ${formatPrice(Math.round(l.ppsmUsd), locale)}/m²` : ''}
            </div>
          </div>
          <a
            href={l.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ms-auto flex h-10 shrink-0 items-center rounded-md bg-signal px-4 text-[13px] font-medium text-[#0B0E0C] transition-[filter] active:brightness-110"
          >
            <span className="truncate">{t('detail.viewOnSource', { site })}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
