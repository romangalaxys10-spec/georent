'use client';

/**
 * AlertsSection — "My alerts" card. Rendered twice by page.tsx (desktop rail
 * + mobile sheet); both instances share state through ui-store:
 *
 * - rows: name · match-count chip (live from GET /api/alerts) · mono terms
 *   summary ($80K–$90K · 2BR · 50–70M² · district names) · active Switch ·
 *   edit (opens the shared dialog) · two-step inline delete;
 * - header: "Scan now" (POST /api/scan → the scanner mini-service does one
 *   poll cycle immediately; counts refresh a few seconds later) + create.
 * - `alertsVersion` from ui-store is the refreshKey, so every mutation made
 *   anywhere (dialog, toggle, delete) refreshes match counts everywhere.
 */
import { useEffect, useRef, useState } from 'react';
import { BellRing, Pencil, Radar, Trash2 } from 'lucide-react';

import { toast } from '@/hooks/use-toast';
import { useI18n } from '@/lib/i18n';
import { isDemo } from '@/lib/demo/flags';
import { Switch } from '@/components/ui/switch';
import { useFetch } from './use-fetch';
import { CITIES, type AlertItem } from './types';
import { useUiStore } from './ui-store';
import { useDemoAlerts, demoAlertToRow } from './use-demo';

function safeIds(json: string): number[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  } catch {
    return [];
  }
}

const fmtK = (n: number): string =>
  n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`;

function termsParts(alert: AlertItem, districtNames: Map<number, string>): string[] {
  const parts: string[] = [];
  if (alert.minPrice != null && alert.maxPrice != null) parts.push(`${fmtK(alert.minPrice)}–${fmtK(alert.maxPrice)}`);
  else if (alert.minPrice != null) parts.push(`≥${fmtK(alert.minPrice)}`);
  else if (alert.maxPrice != null) parts.push(`≤${fmtK(alert.maxPrice)}`);

  const rooms = safeIds(alert.roomCounts).sort((a, b) => a - b);
  if (rooms.length === 1) parts.push(`${rooms[0] === 5 ? '5+' : rooms[0]}BR`);
  else if (rooms.length > 1) {
    const contiguous = rooms[rooms.length - 1] - rooms[0] === rooms.length - 1;
    parts.push(contiguous ? `${rooms[0]}–${rooms[rooms.length - 1] === 5 ? '5+' : rooms[rooms.length - 1]}BR` : rooms.map((r) => `${r}BR`).join('/'));
  }

  if (alert.minArea != null && alert.maxArea != null) parts.push(`${Math.round(alert.minArea)}–${Math.round(alert.maxArea)}M²`);
  else if (alert.minArea != null) parts.push(`≥${Math.round(alert.minArea)}M²`);
  else if (alert.maxArea != null) parts.push(`≤${Math.round(alert.maxArea)}M²`);

  const ids = safeIds(alert.districtIds);
  if (ids.length > 0) {
    const names = ids
      .map((id) => districtNames.get(id))
      .filter((n): n is string => Boolean(n));
    parts.push(names.length > 0 ? names.join(', ') : `${ids.length}D`);
  } else {
    const city = CITIES.find((c) => c.id === alert.cityId);
    parts.push(city?.name.toUpperCase() ?? `CITY ${alert.cityId}`);
  }
  return parts;
}

function AlertRow({
  alert,
  districtNames,
  onToggle,
  onDelete,
}: {
  alert: AlertItem;
  districtNames: Map<number, string>;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const openAlertDialog = useUiStore((s) => s.openAlertDialog);

  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3500);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirming(false);
    onDelete();
  };

  const parts = termsParts(alert, districtNames);

  return (
    <div className={`border-b border-border px-4 py-3 last:border-b-0 ${alert.active ? '' : 'opacity-55'}`}>
      <div className="flex items-center gap-2">
        <span className="truncate text-[13px] font-medium text-text">{alert.name}</span>
        <span
          className={`ms-auto shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] tnum ${
            alert.matchCount > 0 ? 'bg-signal-dim text-signal' : 'bg-raised text-faint'
          }`}
        >
          {alert.matchCount} {t('alerts.matches')}
        </span>
      </div>

      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.06em] leading-relaxed text-faint tnum">
        {parts.join(' · ')}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        <Switch
          checked={alert.active}
          onCheckedChange={(on) => onToggle(on)}
          aria-label={alert.active ? t('alerts.pause') : t('alerts.resume')}
        />
        <span className="micro text-faint">{alert.active ? t('alerts.active') : t('alerts.paused')}</span>

        <span className="ms-auto flex items-center gap-0.5">
          <button
            type="button"
            aria-label={t('alerts.edit')}
            title={t('alerts.edit')}
            onClick={() => openAlertDialog(alert.id)}
            className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('alerts.delete')}
            title={confirming ? t('alerts.confirmDelete') : t('alerts.delete')}
            onClick={() => handleDelete()}
            className={`flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
              confirming
                ? 'bg-danger-dim text-danger'
                : 'text-faint hover:bg-accent hover:text-danger'
            }`}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </span>
      </div>

      {confirming ? (
        <button
          type="button"
          onClick={() => handleDelete()}
          className="micro mt-2 w-full rounded-md border border-danger/40 px-2 py-1.5 text-danger transition-colors hover:bg-danger-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {t('alerts.confirmDelete')}
        </button>
      ) : null}
    </div>
  );
}

export function AlertsSection() {
  const { t } = useI18n();
  const alertsVersion = useUiStore((s) => s.alertsVersion);
  const bumpAlertsVersion = useUiStore((s) => s.bumpAlertsVersion);
  const openAlertDialog = useUiStore((s) => s.openAlertDialog);
  const demo = isDemo();

  // Demo transport (localStorage + /api/demo/scan) — always mounted.
  const demoApi = useDemoAlerts();
  // Live transport (Prisma-backed /api/alerts) — idle in demo mode.
  const { data: liveAlerts, error, loading } = useFetch<AlertItem[]>(
    demo ? null : '/api/alerts',
    { refreshKey: alertsVersion },
  );

  const [localScanning, setLocalScanning] = useState(false);
  const scanning = demo ? demoApi.scanning : localScanning;

  const alerts: AlertItem[] = demo
    ? demoApi.alerts.map((a) => demoAlertToRow(a, demoApi.seen))
    : liveAlerts ?? [];

  // District-id → name maps per city (for the terms summary lines).
  const [districtNamesByCity, setDistrictNamesByCity] = useState<Map<number, Map<number, string>>>(
    () => new Map(),
  );
  const fetchingCities = useRef(new Set<number>());

  useEffect(() => {
    const cities = new Set(alerts.map((a) => a.cityId));
    const missing = [...cities].filter(
      (cityId) => !districtNamesByCity.has(cityId) && !fetchingCities.current.has(cityId),
    );
    if (missing.length === 0) return;
    for (const cityId of missing) fetchingCities.current.add(cityId);
    queueMicrotask(() => {
      void Promise.all(
        missing.map(async (cityId) => {
          try {
            const res = await fetch(`/api/districts?cityId=${cityId}`);
            if (!res.ok) return [cityId, new Map<number, string>()] as const;
            const data = (await res.json()) as { districts: { id: number; name: string }[] };
            return [cityId, new Map(data.districts.map((d) => [d.id, d.name]))] as const;
          } catch {
            return [cityId, new Map<number, string>()] as const;
          }
        }),
      ).then((entries) => {
        setDistrictNamesByCity((prev) => {
          const next = new Map(prev);
          for (const [cityId, map] of entries) next.set(cityId, map);
          return next;
        });
      });
    });
  }, [alerts, districtNamesByCity]);

  const triggerScan = async () => {
    if (scanning) return;
    if (demo) {
      await demoApi.scanNow();
      toast({ description: t('alerts.scanTriggered') });
      return;
    }
    setLocalScanning(true);
    try {
      await fetch('/api/scan', { method: 'POST' });
      toast({ description: t('alerts.scanTriggered') });
    } catch {
      // scanner unreachable — status chip in the header already tells the story
    } finally {
      // The scanner cycle takes a few seconds; refresh match counts after it settles.
      setTimeout(() => {
        setLocalScanning(false);
        bumpAlertsVersion();
      }, 6000);
    }
  };

  const toggleActive = (id: string, active: boolean) => {
    if (demo) {
      demoApi.toggleActive(id, active);
      return;
    }
    void fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active }),
    })
      .catch(() => {})
      .then(() => bumpAlertsVersion());
  };

  const deleteAlert = (id: string) => {
    if (demo) {
      demoApi.remove(id);
      return;
    }
    void fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then((res) => {
        if (res.ok) toast({ description: t('alerts.deleted') });
      })
      .catch(() => {})
      .then(() => bumpAlertsVersion());
  };

  const iconBtn =
    'flex size-7 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';

  return (
    <div className="rounded-xl border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <BellRing className="size-3.5 text-faint" aria-hidden />
        <span className="micro text-muted">{t('alerts.myAlerts')}</span>
        <span className="ms-auto flex items-center gap-1.5">
          <button
            type="button"
            className={iconBtn}
            disabled={scanning}
            onClick={() => void triggerScan()}
            aria-label={t('alerts.scanNow')}
            title={t('alerts.scanNow')}
          >
            <Radar className={`size-3.5 ${scanning ? 'animate-spin' : ''}`} aria-hidden />
          </button>
          <button
            type="button"
            className={`${iconBtn} border-signal/40 text-signal hover:border-signal hover:bg-signal-dim hover:text-signal`}
            onClick={() => openAlertDialog()}
            aria-label={t('alerts.create')}
            title={t('alerts.create')}
          >
            <svg viewBox="0 0 14 14" className="size-3" aria-hidden>
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      </div>

      {/* Body */}
      {error ? (
        <p className="px-4 py-5 font-mono text-[11px] text-danger">{t('common.error')}</p>
      ) : loading && !liveAlerts ? (
        <div className="flex flex-col gap-2.5 px-4 py-4" aria-hidden>
          {Array.from({ length: 2 }, (_, i) => (
            <span key={i} className="h-14 animate-pulse rounded-md bg-raised" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-start gap-2.5 px-4 py-4">
          <p className="text-[12px] leading-relaxed text-muted">{t('alerts.none')}</p>
          <button
            type="button"
            onClick={() => openAlertDialog()}
            className="h-8 rounded-md bg-signal px-3 font-medium text-[12px] text-[#0B0E0C] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {t('alerts.create')}
          </button>
        </div>
      ) : (
        alerts.map((alert) => (
          <AlertRow
            key={alert.id}
            alert={alert}
            districtNames={districtNamesByCity.get(alert.cityId) ?? new Map()}
            onToggle={(active) => toggleActive(alert.id, active)}
            onDelete={() => deleteAlert(alert.id)}
          />
        ))
      )}
    </div>
  );
}
