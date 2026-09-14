'use client';

/**
 * ListingCard — the feed atom, exactly per design.md §2:
 * image (aspect 4/3, hover scale 1.04, gradient scrim) · freshness chip
 * top-left (mono 10px, green dot when <60m) · deal-score ring top-right ·
 * price row (Geist Mono 20px tabular + "/m²" muted) · district line ·
 * meta row (mono 11px uppercase, middots) · footer: View on Korter ↗ +
 * NEW chip (pulse) when the listing actualized within 24h. Price-drop flair
 * arrives with Task 6 (notifications carry firstSeen/lastPrice from the DB).
 */
import { ArrowUpRight, MapPin } from 'lucide-react';

import { formatPrice, useI18n } from '@/lib/i18n';
import type { ScoredListing } from './types';
import { ScoreRing } from './score-ring';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** "5M" / "13H" / "2D" freshness token + whether it is under an hour old. */
function freshness(actualizeTime: string): { label: string; fresh: boolean } {
  const age = Math.max(0, Date.now() - new Date(actualizeTime).getTime());
  if (age < HOUR) return { label: `${Math.floor(age / MIN)}M`, fresh: true };
  if (age < DAY) return { label: `${Math.floor(age / HOUR)}H`, fresh: false };
  return { label: `${Math.floor(age / DAY)}D`, fresh: false };
}

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

  const fresh = freshness(l.actualizeTime);
  const isNew = Date.now() - new Date(l.actualizeTime).getTime() < DAY;

  const ppsm = l.ppsm > 0 ? formatPrice(Math.round(l.ppsm), locale) : null;
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

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-300 hover:border-border-strong">
      {/* Image + chips — whole block clickable to Korter */}
      <a
        href={l.link}
        target="_blank"
        rel="noopener noreferrer"
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
        {/* Deal-score ring top-right */}
        <span className="absolute end-2 top-2 rounded-full bg-[#0B0E0C]/70 p-0.5 backdrop-blur-sm">
          <ScoreRing score={l.score} title={scoreTitle} />
        </span>
      </a>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {/* Price row: mono 20px 600 tabular + "/m²" 12px muted, right-aligned */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[20px] font-semibold leading-none tracking-[-0.01em] text-text tnum">
            {formatPrice(l.price, locale)}
          </span>
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

      {/* Footer: NEW chip + View on Korter ↗ */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        {isNew ? (
          <span className="flex items-center gap-1.5 rounded-md bg-signal-dim px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-signal">
            <span aria-hidden className="size-[5px] rounded-full bg-signal animate-pulse-dot" />
            {t('listing.new')}
          </span>
        ) : (
          <span aria-hidden />
        )}
        <a
          href={l.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {t('listing.view')}
          <ArrowUpRight className="size-3 rtl:rotate-180" aria-hidden />
        </a>
      </div>
    </article>
  );
}
