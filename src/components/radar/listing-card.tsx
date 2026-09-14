'use client';

/**
 * ListingCard — the feed atom, extended for multi-source:
 * image (aspect 4/3, hover scale 1.04, gradient scrim) · freshness chip
 * top-left (mono 10px, green dot when <60m) · deal-score ring top-right ·
 * source chip under the freshness chip (provider color + label) · price row
 * (mono 20px tabular + "/m²" muted) · district line · meta row · footer:
 * Offer page → (internal detail) + source-site ↗ + cross-listed badge.
 * Whole card navigates to the internal offer page; the external link is
 * explicit in the footer.
 */
import Link from 'next/link';
import { ArrowUpRight, Layers, MapPin } from 'lucide-react';

import { formatPrice, useI18n } from '@/lib/i18n';
import type { ScoredListing } from './types';
import { ScoreRing } from './score-ring';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** "5M" / "13H" / "2D" freshness token + whether it is under an hour old. */
function freshness(updatedAt: string): { label: string; fresh: boolean } {
  const age = Math.max(0, Date.now() - new Date(updatedAt).getTime());
  if (age < HOUR) return { label: `${Math.floor(age / MIN)}M`, fresh: true };
  if (age < DAY) return { label: `${Math.floor(age / HOUR)}H`, fresh: false };
  return { label: `${Math.floor(age / DAY)}D`, fresh: false };
}

const PROVIDER_META: Record<
  ScoredListing['provider'],
  { label: string; dot: string }
> = {
  korter: { label: 'Korter', dot: 'bg-signal' },
  ss: { label: 'SS.ge', dot: 'bg-[#E8A03C]' },
  myhome: { label: 'MyHome', dot: 'bg-[#7A9E7E]' },
};

function scoreLabelKey(
  score: number,
  basis: ScoredListing['basis'],
): 'listing.warmingUp' | 'listing.scoreExcellent' | 'listing.scoreGood' | 'listing.scoreFair' | 'listing.scorePricey' {
  if (basis === 'none' || basis === 'city') return 'listing.warmingUp';
  if (score >= 70) return 'listing.scoreExcellent';
  if (score >= 50) return 'listing.scoreGood';
  if (score >= 30) return 'listing.scoreFair';
  return 'listing.scorePricey';
}

export function ListingCard({ listing: l }: { listing: ScoredListing }) {
  const { t, locale } = useI18n();

  const fresh = freshness(l.updatedAt);
  const isNew = Date.now() - new Date(l.updatedAt).getTime() < DAY;
  const providerMeta = PROVIDER_META[l.provider] ?? PROVIDER_META.korter;

  const ppsm = l.ppsmUsd > 0 ? formatPrice(Math.round(l.ppsmUsd), locale) : null;
  const isStudio = l.roomCount === 1 && l.area < 45;
  const roomsLabel = isStudio ? t('listing.studio') : `${l.roomCount} BR`;
  const floorLabel =
    typeof l.floor === 'number' && typeof l.floorCount === 'number' && l.floorCount > 0
      ? t('listing.floor', { n: l.floor, total: l.floorCount })
      : null;
  const meta = [roomsLabel, `${Math.round(l.area)} m²`, floorLabel]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ');

  const scoreTitle = `${t('listing.dealScore')}: ${t(scoreLabelKey(l.score, l.basis))}`;
  const place = l.districtName ?? l.address ?? l.buildingName ?? null;
  // Korter details need the card link as a hint; tnet sources resolve by id.
  const detailHref =
    l.provider === 'korter'
      ? `/listing/korter/${l.objectId}?url=${encodeURIComponent(l.sourceUrl)}`
      : `/listing/${l.provider}/${l.objectId}`;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-300 hover:border-border-strong">
      {/* Image + chips — whole block links to the internal offer page */}
      <Link
        href={detailHref}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-raised"
        tabIndex={-1}
        aria-hidden
      >
        {l.image ? (
          <img
            src={l.image}
            alt=""
            loading="lazy"
            decoding="async"
            width={800}
            height={630}
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <span className="micro flex size-full items-center justify-center text-faint">
            {place ?? '—'}
          </span>
        )}
        {/* Scrim for chip legibility */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#0B0E0C]/85 to-transparent"
        />
        {/* Freshness chip: mono 10px + green dot when <60m */}
        <span className="absolute start-2 top-2 flex items-center gap-1.5 rounded-md bg-[#0B0E0C]/70 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-text backdrop-blur-sm">
          {fresh.fresh ? (
            <span aria-hidden className="size-[5px] rounded-full bg-signal" />
          ) : null}
          {fresh.label}
        </span>
        {/* Source chip */}
        <span className="absolute start-2 top-8 flex items-center gap-1.5 rounded-md bg-[#0B0E0C]/70 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-text backdrop-blur-sm">
          <span aria-hidden className={`size-[5px] rounded-full ${providerMeta.dot}`} />
          {providerMeta.label}
        </span>
        {/* Deal-score ring top-right */}
        <span className="absolute end-2 top-2 rounded-full bg-[#0B0E0C]/70 p-0.5 backdrop-blur-sm">
          <ScoreRing score={l.score} title={scoreTitle} />
        </span>
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {/* Price row: mono 20px 600 tabular + "/m²" 12px muted, right-aligned */}
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={detailHref}
            className="font-mono text-[20px] font-semibold leading-none tracking-[-0.01em] text-text tnum transition-colors hover:text-signal"
          >
            {formatPrice(l.priceUsd, locale)}
          </Link>
          {ppsm ? (
            <span className="font-mono text-[12px] leading-none text-muted tnum">
              {ppsm} {t('listing.perm2')}
            </span>
          ) : null}
        </div>

        {/* District line: 13px muted + MapPin 12px */}
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
          <MapPin className="size-3 shrink-0 text-faint" aria-hidden />
          <span className="truncate">{place ?? '—'}</span>
          {l.districtName && l.address ? (
            <span className="truncate text-faint">· {l.address}</span>
          ) : null}
        </div>

        {/* Meta row: mono 11px uppercase — "2 BR · 64 M² · FLOOR 7/25" */}
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted tnum">
          {meta}
        </div>
      </div>

      {/* Footer: NEW chip / cross-listed + Offer page / source ↗ */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {isNew ? (
            <span className="flex items-center gap-1.5 rounded-md bg-signal-dim px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-signal">
              <span aria-hidden className="size-[5px] rounded-full bg-signal animate-pulse-dot" />
              {t('listing.new')}
            </span>
          ) : null}
          {(l.alsoOn?.length ?? 0) > 0 ? (
            <span
              className="flex items-center gap-1 rounded-md bg-raised px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted"
              title={t('listing.alsoOn')}
            >
              <Layers className="size-3" aria-hidden />
              {l.alsoOn!.map((p) => (p === 'ss' ? 'SS' : p === 'myhome' ? 'MH' : 'K')).join('+')}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={detailHref}
            className="flex items-center gap-1 text-[12px] text-signal transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {t('listing.offerPage')}
            <ArrowUpRight className="size-3 rtl:rotate-180" aria-hidden />
          </Link>
          <a
            href={l.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {providerMeta.label}
            <ArrowUpRight className="size-3 rtl:rotate-180" aria-hidden />
          </a>
        </div>
      </div>
    </article>
  );
}
