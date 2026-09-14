'use client';

/**
 * HeroStats — compact hero per design.md §5: localized H1 + one-line subtitle
 * + primary CTA ("Create your first alert" → the shared alert dialog) on the
 * left; three stat chips on the right (mono micro-label + mono 18px number):
 * TRACKED (citywide sampleCount from /api/stats) · DISTRICTS (districts
 * count) · LAST SCAN (short mono age token from the live scanner socket —
 * "5M"/"2H"/"3D", matching the listing freshness chips).
 * No gradient banner, no illustration.
 */
import { useI18n } from '@/lib/i18n';
import { isDemo } from '@/lib/demo/flags';
import { useDemoStore } from '@/lib/demo/store';
import { useFetch } from './use-fetch';
import { useScannerStatus } from './scanner-socket';
import { useUiStore } from './ui-store';
import type { StatsResponse } from './types';

/** en-US digit grouping — Latin digits in every locale (design.md rule). */
const fmtInt = (n: number): string => new Intl.NumberFormat('en-US').format(n);

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** "5M" / "13H" / "2D" — same freshness grammar as the listing chips. */
function scanAgeLabel(lastScanAt: string | null): string {
  if (!lastScanAt) return '—';
  const age = Math.max(0, Date.now() - new Date(lastScanAt).getTime());
  if (age < HOUR) return `${Math.max(0, Math.floor(age / MIN))}M`;
  if (age < DAY) return `${Math.floor(age / HOUR)}H`;
  return `${Math.floor(age / DAY)}D`;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2.5">
      <span className="micro truncate text-faint">{label}</span>
      <span className="font-mono text-[18px] font-semibold leading-none tracking-[-0.01em] text-text tnum">
        {value}
      </span>
    </div>
  );
}

export function HeroStats({ cityId }: { cityId: number }) {
  const { t } = useI18n();
  const demo = isDemo();
  // Demo mode: no server-side stats — TRACKED is the size of the client's
  // observed baseline and LAST SCAN comes from the client scan loop.
  const { data } = useFetch<StatsResponse>(demo ? null : `/api/stats?cityId=${cityId}`);
  const demoSeenCount = useDemoStore((s) => Object.keys(s.seen).length);
  const { lastScanAt, status } = useScannerStatus();
  const openAlertDialog = useUiStore((s) => s.openAlertDialog);

  const tracked = demo ? demoSeenCount : data ? data.citywide.sampleCount : null;
  const districts = data ? data.districts.length : null;
  const lastScan = status === 'offline' ? 'OFFLINE' : scanAgeLabel(lastScanAt);

  return (
    <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-[clamp(28px,4vw,40px)] font-semibold leading-[1.05] tracking-[-0.03em] text-text">
          {t('hero.title')}
        </h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted">{t('hero.subtitle')}</p>
        <button
          type="button"
          onClick={() => openAlertDialog()}
          className="mt-4 flex h-9 items-center gap-2 rounded-md bg-signal px-4 font-medium text-[13px] text-[#0B0E0C] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {t('hero.cta')}
        </button>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3 lg:w-[380px]">
        <StatChip label="TRACKED" value={tracked === null ? '—' : fmtInt(tracked)} />
        <StatChip label="DISTRICTS" value={districts === null ? '—' : fmtInt(districts)} />
        <StatChip label="LAST SCAN" value={lastScan} />
      </div>
    </section>
  );
}
