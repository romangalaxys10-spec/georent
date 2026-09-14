'use client';

/**
 * AlertDialogForm — create/edit alert dialog. ONE instance is mounted by
 * page.tsx; the hero CTA, the alerts rail and the mobile sheet all open it
 * through ui-store (openAlertDialog / editingAlertId).
 *
 * Prefill strategy without setState-in-effect: the inner form is keyed by
 * `editingAlertId ?? 'create'` and only mounted when the dialog is open and
 * (in edit mode) the alerts list has loaded — so useState initializers run
 * exactly once per open with the right values.
 *
 * Validation mirrors the server contract (POST /api/alerts): name 1..80,
 * positive integers, min<=max cross-checked on both price and area before
 * submit; server 400s are surfaced verbatim in the footer.
 */
import { useState } from 'react';

import { useI18n } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFetch } from './use-fetch';
import { NumberInput } from './filters-panel';
import { useUiStore } from './ui-store';
import { isDemo } from '@/lib/demo/flags';
import { useDemoAlerts, demoAlertToRow } from './use-demo';
import { CITIES, type AlertItem, type DistrictsResponse } from './types';

const ROOM_OPTIONS = [1, 2, 3, 4, 5];

const chipBase =
  'flex h-7 items-center rounded-md border px-2.5 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
const chipOff = 'border-border bg-raised text-muted hover:border-border-strong hover:text-text';
const chipOn = 'border-signal/50 bg-signal-dim text-signal';

const inputBase =
  'h-9 w-full min-w-0 rounded-md border border-border bg-raised font-mono text-[13px] text-text tnum placeholder:text-faint outline-none transition-colors focus:border-signal';

function MicroLabel({ children }: { children: React.ReactNode }) {
  return <span className="micro text-faint">{children}</span>;
}

type FormState = {
  name: string;
  cityId: number;
  districtIds: number[];
  roomCounts: number[];
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
};

function AlertFormInner({
  alert,
  onClose,
}: {
  alert: AlertItem | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const bumpAlertsVersion = useUiStore((s) => s.bumpAlertsVersion);
  const demoApi = useDemoAlerts();

  const [form, setForm] = useState<FormState>(() =>
    alert
      ? {
          name: alert.name,
          cityId: alert.cityId,
          districtIds: safeIds(alert.districtIds),
          roomCounts: safeIds(alert.roomCounts),
          minPrice: alert.minPrice ?? undefined,
          maxPrice: alert.maxPrice ?? undefined,
          minArea: alert.minArea ?? undefined,
          maxArea: alert.maxArea ?? undefined,
        }
      : {
          name: '',
          cityId: 1,
          districtIds: [],
          roomCounts: [],
        },
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    data: districtData,
    loading: districtsLoading,
  } = useFetch<DistrictsResponse>(`/api/districts?cityId=${form.cityId}`);

  const toggle = (list: number[], id: number): number[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const handleSubmit = async () => {
    if (form.name.trim().length === 0) {
      setFormError(t('alerts.invalidName'));
      return;
    }
    if (
      (form.minPrice !== undefined && form.maxPrice !== undefined && form.minPrice > form.maxPrice) ||
      (form.minArea !== undefined && form.maxArea !== undefined && form.minArea > form.maxArea)
    ) {
      setFormError(t('alerts.invalidRange'));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (isDemo()) {
        demoApi.save({
          id: alert?.id ?? null,
          name: form.name.trim(),
          cityId: form.cityId,
          minPrice: form.minPrice,
          maxPrice: form.maxPrice,
          minArea: form.minArea,
          maxArea: form.maxArea,
          districtIds: form.districtIds,
          roomCounts: form.roomCounts,
        });
        onClose();
        return;
      }
      const payload = {
        name: form.name.trim(),
        cityId: form.cityId,
        districtIds: form.districtIds,
        roomCounts: form.roomCounts,
        ...(form.minPrice !== undefined ? { minPrice: Math.round(form.minPrice) } : {}),
        ...(form.maxPrice !== undefined ? { maxPrice: Math.round(form.maxPrice) } : {}),
        ...(form.minArea !== undefined ? { minArea: form.minArea } : {}),
        ...(form.maxArea !== undefined ? { maxArea: form.maxArea } : {}),
      };
      const res = await fetch('/api/alerts', {
        method: alert ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert ? { ...payload, id: alert.id } : payload),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          json !== null && typeof json === 'object' && 'error' in json
            ? String((json as { error: unknown }).error)
            : `HTTP ${res.status}`;
        throw new Error(message);
      }
      bumpAlertsVersion();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader className="gap-1 px-5 pb-4 pt-5">
        <DialogTitle className="micro text-muted">
          {alert ? t('alerts.edit') : t('alerts.create')}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {alert ? t('alerts.edit') : t('alerts.create')}
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto border-t border-border px-5 py-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <MicroLabel>{t('alerts.name')}</MicroLabel>
          <input
            type="text"
            value={form.name}
            maxLength={80}
            placeholder={t('alerts.namePlaceholder')}
            aria-label={t('alerts.name')}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={`${inputBase} ps-2.5 font-sans text-[13px] tracking-normal normal-case`}
          />
        </div>

        {/* Budget */}
        <div className="flex flex-col gap-1.5">
          <MicroLabel>{t('filters.budget')}</MicroLabel>
          <div className="flex items-center gap-2">
            <NumberInput
              ariaLabel={`${t('filters.budget')} — ${t('filters.from')}`}
              placeholder={t('filters.from')}
              prefix="$"
              value={form.minPrice}
              onChange={(n) => setForm({ ...form, minPrice: n })}
            />
            <NumberInput
              ariaLabel={`${t('filters.budget')} — ${t('filters.to')}`}
              placeholder={t('filters.to')}
              prefix="$"
              value={form.maxPrice}
              onChange={(n) => setForm({ ...form, maxPrice: n })}
            />
          </div>
        </div>

        {/* City */}
        <div className="flex flex-col gap-1.5">
          <MicroLabel>{t('filters.city')}</MicroLabel>
          <Select
            value={String(form.cityId)}
            onValueChange={(v) =>
              setForm({ ...form, cityId: Number(v), districtIds: [] })
            }
          >
            <SelectTrigger className="h-9 w-full rounded-md border-border bg-raised font-mono text-[13px] text-text focus-visible:ring-ring/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-border">
              {CITIES.map((city) => (
                <SelectItem key={city.id} value={String(city.id)} className="font-mono text-[13px]">
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Districts */}
        <div className="flex flex-col gap-1.5">
          <MicroLabel>{t('filters.districts')}</MicroLabel>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border bg-raised/40 p-2">
            {districtsLoading ? (
              Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="h-7 w-16 animate-pulse rounded-md bg-raised" aria-hidden />
              ))
            ) : (
              (districtData?.districts ?? []).map((d) => {
                const active = form.districtIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setForm({ ...form, districtIds: toggle(form.districtIds, d.id) })
                    }
                    className={`${chipBase} ${active ? chipOn : chipOff}`}
                  >
                    {d.name}
                  </button>
                );
              })
            )}
          </div>
          {form.districtIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setForm({ ...form, districtIds: [] })}
              className="micro w-fit text-faint transition-colors hover:text-muted"
            >
              {t('filters.anyDistrict')}
            </button>
          ) : null}
        </div>

        {/* Rooms */}
        <div className="flex flex-col gap-1.5">
          <MicroLabel>{t('filters.rooms')}</MicroLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {ROOM_OPTIONS.map((rooms) => {
              const active = form.roomCounts.includes(rooms);
              return (
                <button
                  key={rooms}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setForm({ ...form, roomCounts: toggle(form.roomCounts, rooms) })
                  }
                  className={`${chipBase} min-w-9 justify-center ${active ? chipOn : chipOff}`}
                >
                  {rooms === 5 ? '5+' : rooms}
                </button>
              );
            })}
            {form.roomCounts.length > 0 ? (
              <button
                type="button"
                onClick={() => setForm({ ...form, roomCounts: [] })}
                className={`${chipBase} ${chipOff}`}
              >
                {t('filters.anyRooms')}
              </button>
            ) : null}
          </div>
        </div>

        {/* Area */}
        <div className="flex flex-col gap-1.5">
          <MicroLabel>{t('filters.area')}</MicroLabel>
          <div className="flex items-center gap-2">
            <NumberInput
              ariaLabel={`${t('filters.area')} — ${t('filters.from')}`}
              placeholder={t('filters.from')}
              value={form.minArea}
              onChange={(n) => setForm({ ...form, minArea: n })}
            />
            <NumberInput
              ariaLabel={`${t('filters.area')} — ${t('filters.to')}`}
              placeholder={t('filters.to')}
              value={form.maxArea}
              onChange={(n) => setForm({ ...form, maxArea: n })}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-border px-5 py-4">
        {formError ? (
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] leading-relaxed text-danger">
            {formError}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-border px-4 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSubmit()}
          className="h-9 rounded-md bg-signal px-4 font-medium text-[13px] text-[#0B0E0C] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
        >
          {saving ? `${t('common.loading')}…` : t('common.save')}
        </button>
      </div>
    </>
  );
}

/** Parse an alert's JSON-string id array ("[1,2]") into numbers. */
function safeIds(json: string): number[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  } catch {
    return [];
  }
}

export function AlertDialogForm() {
  const { t } = useI18n();
  const open = useUiStore((s) => s.alertDialogOpen);
  const editingAlertId = useUiStore((s) => s.editingAlertId);
  const closeAlertDialog = useUiStore((s) => s.closeAlertDialog);
  const demoApi = useDemoAlerts();

  // Live mode: load alerts only while the dialog is open (url null idles).
  // Demo mode: the store already has everything.
  const { data: liveAlerts } = useFetch<AlertItem[]>(
    open && !isDemo() ? '/api/alerts' : null,
  );
  const allAlerts: AlertItem[] = isDemo()
    ? demoApi.alerts.map((a) => demoAlertToRow(a, demoApi.seen))
    : liveAlerts ?? [];
  const editing =
    open && editingAlertId ? allAlerts.find((a) => a.id === editingAlertId) ?? null : null;
  const ready = open && (editingAlertId === null || allAlerts.length > 0 || !isDemo());

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeAlertDialog())}>
      <DialogContent className="max-w-[460px] gap-0 border-border bg-surface p-0">
        <DialogDescription className="sr-only">{t('alerts.create')}</DialogDescription>
        {ready ? (
          <AlertFormInner key={editingAlertId ?? 'create'} alert={editing} onClose={closeAlertDialog} />
        ) : (
          <div className="flex flex-col gap-3 px-5 py-6" aria-hidden>
            <span className="h-4 w-1/3 animate-pulse rounded bg-raised" />
            <span className="h-9 w-full animate-pulse rounded-md bg-raised" />
            <span className="h-9 w-full animate-pulse rounded-md bg-raised" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
