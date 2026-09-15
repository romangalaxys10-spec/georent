'use client';

/**
 * FiltersPanel — left-rail search terms per design.md §4.
 *
 * Fully controlled: every interaction calls onChange(next) — the parent owns
 * state and (in ExploreView) debounces the refetch by 300ms, so typing in the
 * budget inputs applies live. `onApplied` lets the mobile sheet close after
 * Apply. All inputs: h-9, bg-raised, hairline border, focus:border-signal,
 * mono text. Districts stream from /api/districts (refetches on city change,
 * skeleton chips while loading).
 */
import { Search, SlidersHorizontal } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import type { ProviderName } from '@/lib/providers/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFetch } from './use-fetch';
import { CITIES, type DistrictsResponse } from './types';

export type SortValue = 'update_time_desc' | 'price_asc' | 'price_sqm_asc' | 'score';

export type FiltersState = {
  cityId: number;
  /** buy (sale) or rent — rent prices are monthly. */
  deal: 'buy' | 'rent';
  districts: number[];
  rooms: number[];
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  sort: SortValue;
  /** Free-text keyword (live on ss/myhome). */
  keyword: string;
  /** Bedroom counts — post-filtered. */
  bedrooms: number[];
  minFloor?: number;
  maxFloor?: number;
  /** USD/m² bounds — post-filtered everywhere. */
  minPpsm?: number;
  maxPpsm?: number;
  newBuilding: boolean;
  hasBalcony: boolean;
  /** Active source subset; empty = all three. */
  sources: ProviderName[];
};

export const DEFAULT_FILTERS: FiltersState = {
  cityId: 1,
  deal: 'buy',
  districts: [],
  rooms: [],
  sort: 'update_time_desc',
  keyword: '',
  bedrooms: [],
  newBuilding: false,
  hasBalcony: false,
  sources: [],
};

const ROOM_OPTIONS = [1, 2, 3, 4, 5];
const BEDROOM_OPTIONS = [1, 2, 3, 4];
const SOURCE_OPTIONS: { id: ProviderName; label: string }[] = [
  { id: 'korter', label: 'Korter' },
  { id: 'ss', label: 'SS.ge' },
  { id: 'myhome', label: 'MyHome' },
];

const chipBase =
  'flex h-7 items-center rounded-md border px-2.5 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
const chipOff = 'border-border bg-raised text-muted hover:border-border-strong hover:text-text';
const chipOn = 'border-signal/50 bg-signal-dim text-signal';

const inputBase =
  'h-9 w-full min-w-0 rounded-md border border-border bg-raised font-mono text-[13px] text-text tnum placeholder:text-faint outline-none transition-colors focus:border-signal';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="micro text-faint">{children}</span>;
}

/** Shared numeric field (also reused by the alert dialog). */
export function NumberInput({
  placeholder,
  prefix,
  suffix,
  value,
  onChange,
  ariaLabel,
}: {
  placeholder: string;
  prefix?: string;
  suffix?: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  ariaLabel: string;
}) {
  return (
    <div className="relative flex-1">
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center font-mono text-[13px] text-faint">
          {prefix}
        </span>
      ) : null}
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') {
            onChange(undefined);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className={`${inputBase} ${prefix ? 'ps-6' : 'ps-2.5'} ${suffix ? 'pe-8' : 'pe-2.5'}`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center font-mono text-[11px] text-faint">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function FiltersPanel({
  value,
  onChange,
  onApplied,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
  /** Called right after Apply — used by the mobile sheet to close itself. */
  onApplied?: () => void;
}) {
  const { t } = useI18n();
  const {
    data: districtData,
    error: districtError,
    loading: districtsLoading,
    refetch: refetchDistricts,
  } = useFetch<DistrictsResponse>(`/api/districts?cityId=${value.cityId}`);

  const toggle = (list: number[], id: number): number[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {/* Eyebrow */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="size-3.5 text-faint" aria-hidden />
        <span className="micro text-muted">{t('filters.title')}</span>
      </div>

      {/* Deal type — buy vs rent (rent prices are monthly) */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('search.dealTitle')}</SectionLabel>
        <div
          className="mt-2 flex h-10 items-center rounded-md border border-border bg-raised p-0.5"
          role="radiogroup"
          aria-label={t('search.dealTitle')}
        >
          {(
            [
              { id: 'buy' as const, label: t('search.dealBuy') },
              { id: 'rent' as const, label: t('search.dealRent') },
            ]
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={value.deal === id}
              onClick={() => onChange({ ...value, deal: id })}
              className={`flex h-9 flex-1 items-center justify-center rounded px-3 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                value.deal === id ? 'bg-signal text-[#0B0E0C]' : 'text-muted hover:text-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Keyword */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.keyword')}</SectionLabel>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute inset-y-0 start-2.5 size-3.5 text-faint"
            aria-hidden
          />
          <input
            type="text"
            aria-label={t('filters.keyword')}
            placeholder={t('filters.keywordPlaceholder')}
            value={value.keyword}
            onChange={(e) => onChange({ ...value, keyword: e.target.value })}
            className={`${inputBase} ps-8 pe-2.5`}
          />
        </div>
      </div>

      {/* Budget */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.budget')}</SectionLabel>
        <div className="mt-2 flex items-center gap-2">
          <NumberInput
            ariaLabel={`${t('filters.budget')} — ${t('filters.from')}`}
            placeholder={t('filters.from')}
            prefix="$"
            value={value.minPrice}
            onChange={(n) => onChange({ ...value, minPrice: n })}
          />
          <NumberInput
            ariaLabel={`${t('filters.budget')} — ${t('filters.to')}`}
            placeholder={t('filters.to')}
            prefix="$"
            value={value.maxPrice}
            onChange={(n) => onChange({ ...value, maxPrice: n })}
          />
        </div>
      </div>

      {/* City */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.city')}</SectionLabel>
        <Select
          value={String(value.cityId)}
          onValueChange={(v) =>
            onChange({ ...value, cityId: Number(v), districts: [] })
          }
        >
          <SelectTrigger className="mt-2 h-9 w-full rounded-md border-border bg-raised font-mono text-[13px] text-text focus-visible:ring-ring/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border">
            {CITIES.map((city) => (
              <SelectItem
                key={city.id}
                value={String(city.id)}
                className="font-mono text-[13px]"
              >
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Districts */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.districts')}</SectionLabel>
        <div className="mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pe-1">
          {districtsLoading ? (
            Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="h-7 w-16 animate-pulse rounded-md bg-raised"
                aria-hidden
              />
            ))
          ) : districtError ? (
            <button
              type="button"
              onClick={refetchDistricts}
              className="micro text-danger transition-colors hover:text-text"
            >
              {t('common.error')} — {t('common.retry')}
            </button>
          ) : (
            (districtData?.districts ?? []).map((d) => {
              const active = value.districts.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, districts: toggle(value.districts, d.id) })}
                  className={`${chipBase} ${active ? chipOn : chipOff}`}
                >
                  {d.name}
                </button>
              );
            })
          )}
        </div>
        {value.districts.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange({ ...value, districts: [] })}
            className="micro mt-2 text-faint transition-colors hover:text-muted"
          >
            {t('filters.anyDistrict')}
          </button>
        ) : null}
      </div>

      {/* Bedrooms */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.bedrooms')}</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {BEDROOM_OPTIONS.map((beds) => {
            const active = value.bedrooms.includes(beds);
            return (
              <button
                key={beds}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...value, bedrooms: toggle(value.bedrooms, beds) })}
                className={`${chipBase} min-w-9 justify-center ${active ? chipOn : chipOff}`}
              >
                {beds === 4 ? '4+' : beds}
              </button>
            );
          })}
          {value.bedrooms.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, bedrooms: [] })}
              className={`${chipBase} ${chipOff}`}
            >
              {t('filters.anyRooms')}
            </button>
          ) : null}
        </div>
      </div>

      {/* Rooms */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.rooms')}</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROOM_OPTIONS.map((rooms) => {
            const active = value.rooms.includes(rooms);
            return (
              <button
                key={rooms}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...value, rooms: toggle(value.rooms, rooms) })}
                className={`${chipBase} min-w-9 justify-center ${active ? chipOn : chipOff}`}
              >
                {rooms === 5 ? '5+' : rooms}
              </button>
            );
          })}
          {value.rooms.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, rooms: [] })}
              className={`${chipBase} ${chipOff}`}
            >
              {t('filters.anyRooms')}
            </button>
          ) : null}
        </div>
      </div>

      {/* Area */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.area')}</SectionLabel>
        <div className="mt-2 flex items-center gap-2">
          <NumberInput
            ariaLabel={`${t('filters.area')} — ${t('filters.from')}`}
            placeholder={t('filters.from')}
            value={value.minArea}
            onChange={(n) => onChange({ ...value, minArea: n })}
          />
          <NumberInput
            ariaLabel={`${t('filters.area')} — ${t('filters.to')}`}
            placeholder={t('filters.to')}
            value={value.maxArea}
            onChange={(n) => onChange({ ...value, maxArea: n })}
          />
        </div>
      </div>

      {/* Floor range */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.floor')}</SectionLabel>
        <div className="mt-2 flex items-center gap-2">
          <NumberInput
            ariaLabel={`${t('filters.floor')} — ${t('filters.from')}`}
            placeholder={t('filters.from')}
            value={value.minFloor}
            onChange={(n) =>
              onChange({ ...value, minFloor: n === undefined ? undefined : Math.round(n) })
            }
          />
          <NumberInput
            ariaLabel={`${t('filters.floor')} — ${t('filters.to')}`}
            placeholder={t('filters.to')}
            value={value.maxFloor}
            onChange={(n) =>
              onChange({ ...value, maxFloor: n === undefined ? undefined : Math.round(n) })
            }
          />
        </div>
      </div>

      {/* Price per m² */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.ppsm')}</SectionLabel>
        <div className="mt-2 flex items-center gap-2">
          <NumberInput
            ariaLabel={`${t('filters.ppsm')} — ${t('filters.from')}`}
            placeholder={t('filters.from')}
            prefix="$"
            value={value.minPpsm}
            onChange={(n) => onChange({ ...value, minPpsm: n })}
          />
          <NumberInput
            ariaLabel={`${t('filters.ppsm')} — ${t('filters.to')}`}
            placeholder={t('filters.to')}
            prefix="$"
            value={value.maxPpsm}
            onChange={(n) => onChange({ ...value, maxPpsm: n })}
          />
        </div>
      </div>

      {/* Quick toggles */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.features')}</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={value.newBuilding}
            onClick={() => onChange({ ...value, newBuilding: !value.newBuilding })}
            className={`${chipBase} ${value.newBuilding ? chipOn : chipOff}`}
          >
            {t('filters.newBuilding')}
          </button>
          <button
            type="button"
            aria-pressed={value.hasBalcony}
            onClick={() => onChange({ ...value, hasBalcony: !value.hasBalcony })}
            className={`${chipBase} ${value.hasBalcony ? chipOn : chipOff}`}
          >
            {t('filters.hasBalcony')}
          </button>
        </div>
      </div>

      {/* Sources */}
      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>{t('filters.sources')}</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SOURCE_OPTIONS.map((s) => {
            const active = value.sources.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...value,
                    sources: active
                      ? value.sources.filter((x) => x !== s.id)
                      : [...value.sources, s.id],
                  })
                }
                className={`${chipBase} ${active ? chipOn : chipOff}`}
              >
                {s.label}
              </button>
            );
          })}
          {value.sources.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, sources: [] })}
              className={`${chipBase} ${chipOff}`}
            >
              {t('filters.allSources')}
            </button>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onChange({ ...value });
            onApplied?.();
          }}
          className="h-9 flex-1 rounded-md bg-signal font-medium text-[#0B0E0C] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {t('filters.apply')}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_FILTERS, cityId: value.cityId })}
          className="h-9 rounded-md border border-border bg-transparent px-4 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {t('filters.reset')}
        </button>
      </div>
    </div>
  );
}
