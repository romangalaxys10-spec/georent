'use client';

/**
 * AdFormDialog — publish/edit a local owner listing.
 * Photos are compressed client-side (canvas → JPEG data-URI, ≤400KB each,
 * max 8) so they survive serverless storage constraints without any
 * external object store.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import { authFetch } from '@/lib/auth-client';

const MAX_PHOTOS = 8;
const MAX_BYTES = 400_000;

const CONDITIONS = ['new', 'renovated', 'old', 'under_construction'] as const;
const FURNISHED = ['yes', 'no', 'partial'] as const;

/** Downscale + compress an image file into a data-URI. */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let q = 0.72;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > MAX_BYTES && q > 0.35) {
    q -= 0.12;
    out = canvas.toDataURL('image/jpeg', q);
  }
  if (out.length > MAX_BYTES) throw new Error('photo-too-large');
  return out;
}

export type AdFormValue = {
  id?: string;
  deal: 'buy' | 'rent';
  title: string;
  description: string;
  priceUsd: string;
  area: string;
  roomCount: string;
  bedrooms: string;
  bathrooms: string;
  floor: string;
  floorCount: string;
  condition: string;
  furnished: string;
  cityName: string;
  districtName: string;
  address: string;
  contactName: string;
  contactPhone: string;
  photos: string[];
};

export const EMPTY_AD: AdFormValue = {
  deal: 'buy',
  title: '',
  description: '',
  priceUsd: '',
  area: '',
  roomCount: '',
  bedrooms: '',
  bathrooms: '',
  floor: '',
  floorCount: '',
  condition: '',
  furnished: '',
  cityName: 'Tbilisi',
  districtName: '',
  address: '',
  contactName: '',
  contactPhone: '',
  photos: [],
};

export function AdFormDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: AdFormValue;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [v, setV] = useState<AdFormValue>(initial);
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setV(initial);
      setError(null);
    }
  }, [open, initial]);

  const set = (patch: Partial<AdFormValue>) => setV((prev) => ({ ...prev, ...patch }));

  const addPhotos = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setCompressing(true);
    setError(null);
    try {
      const next = [...v.photos];
      for (const f of Array.from(files).slice(0, MAX_PHOTOS - next.length)) {
        if (!f.type.startsWith('image/')) continue;
        next.push(await compressImage(f));
      }
      set({ photos: next.slice(0, MAX_PHOTOS) });
    } catch (err) {
      setError(err instanceof Error && err.message === 'photo-too-large'
        ? t('ads.photoTooLarge')
        : String(err));
    } finally {
      setCompressing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [v.photos, t]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const num = (s: string): number | undefined => {
          const n = Number(s);
          return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
        };
        const payload = {
          deal: v.deal,
          title: v.title.trim(),
          description: v.description.trim(),
          priceUsd: num(v.priceUsd),
          area: num(v.area),
          roomCount: num(v.roomCount) ?? 0,
          bedrooms: num(v.bedrooms),
          bathrooms: num(v.bathrooms),
          floor: num(v.floor),
          floorCount: num(v.floorCount),
          condition: v.condition || undefined,
          furnished: v.furnished || undefined,
          cityName: v.cityName,
          districtName: v.districtName.trim(),
          address: v.address.trim() || undefined,
          contactName: v.contactName.trim(),
          contactPhone: v.contactPhone.trim(),
          photos: v.photos,
        };
        const res = v.id
          ? await authFetch(`/api/ads/${v.id}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await authFetch('/api/ads', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        onSaved();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [v, onSaved, onClose],
  );

  if (!open) return null;

  const inputCls =
    'mt-1.5 h-11 w-full rounded-md border border-border bg-raised px-3 text-[14px] text-text placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={v.id ? t('ads.editAd') : t('ads.publishAd')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-text">
            {v.id ? t('ads.editAd') : t('ads.publishAd')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex size-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:text-text"
          >
            ✕
          </button>
        </div>

        <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
          {/* Deal toggle */}
          <div className="flex h-10 items-center rounded-md border border-border bg-raised p-0.5" role="radiogroup" aria-label={t('search.dealTitle')}>
            {(['buy', 'rent'] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={v.deal === d}
                onClick={() => set({ deal: d })}
                className={`flex h-9 flex-1 items-center justify-center rounded font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                  v.deal === d ? 'bg-signal text-[#0B0E0C]' : 'text-muted hover:text-text'
                }`}
              >
                {d === 'buy' ? t('search.dealBuy') : t('search.dealRent')}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="ad-title" className="micro text-faint">{t('ads.title')}</label>
            <input id="ad-title" value={v.title} onChange={(e) => set({ title: e.target.value })} required minLength={5} maxLength={120} className={inputCls} placeholder={t('ads.titlePlaceholder')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ad-price" className="micro text-faint">
                {t('ads.price')} ({v.deal === 'rent' ? t('ads.perMonthUsd') : 'USD'})
              </label>
              <input id="ad-price" inputMode="numeric" dir="ltr" value={v.priceUsd} onChange={(e) => set({ priceUsd: e.target.value })} required className={`${inputCls} font-mono tnum`} placeholder="85000" />
            </div>
            <div>
              <label htmlFor="ad-area" className="micro text-faint">{t('ads.area')}</label>
              <input id="ad-area" inputMode="decimal" dir="ltr" value={v.area} onChange={(e) => set({ area: e.target.value })} required className={`${inputCls} font-mono tnum`} placeholder="68" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="ad-rooms" className="micro text-faint">{t('filters.rooms')}</label>
              <input id="ad-rooms" inputMode="numeric" dir="ltr" value={v.roomCount} onChange={(e) => set({ roomCount: e.target.value })} className={`${inputCls} font-mono tnum`} placeholder="2" />
            </div>
            <div>
              <label htmlFor="ad-bedrooms" className="micro text-faint">{t('filters.bedrooms')}</label>
              <input id="ad-bedrooms" inputMode="numeric" dir="ltr" value={v.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} className={`${inputCls} font-mono tnum`} placeholder="1" />
            </div>
            <div>
              <label htmlFor="ad-baths" className="micro text-faint">{t('detail.bathrooms')}</label>
              <input id="ad-baths" inputMode="numeric" dir="ltr" value={v.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} className={`${inputCls} font-mono tnum`} placeholder="1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ad-floor" className="micro text-faint">{t('filters.floor')}</label>
              <input id="ad-floor" inputMode="numeric" dir="ltr" value={v.floor} onChange={(e) => set({ floor: e.target.value })} className={`${inputCls} font-mono tnum`} placeholder="5" />
            </div>
            <div>
              <label htmlFor="ad-floorcount" className="micro text-faint">{t('ads.floorCount')}</label>
              <input id="ad-floorcount" inputMode="numeric" dir="ltr" value={v.floorCount} onChange={(e) => set({ floorCount: e.target.value })} className={`${inputCls} font-mono tnum`} placeholder="12" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ad-condition" className="micro text-faint">{t('detail.condition')}</label>
              <select id="ad-condition" value={v.condition} onChange={(e) => set({ condition: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{t(`condition.${c === 'under_construction' ? 'under' : c}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ad-furnished" className="micro text-faint">{t('ads.furnished')}</label>
              <select id="ad-furnished" value={v.furnished} onChange={(e) => set({ furnished: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {FURNISHED.map((f) => (
                  <option key={f} value={f}>{t(`furnished.${f}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ad-city" className="micro text-faint">{t('filters.city')}</label>
              <select id="ad-city" value={v.cityName} onChange={(e) => set({ cityName: e.target.value })} className={inputCls}>
                <option value="Tbilisi">Tbilisi</option>
                <option value="Batumi">Batumi</option>
              </select>
            </div>
            <div>
              <label htmlFor="ad-district" className="micro text-faint">{t('ads.district')}</label>
              <input id="ad-district" value={v.districtName} onChange={(e) => set({ districtName: e.target.value })} required className={inputCls} placeholder="Vake" />
            </div>
          </div>

          <div>
            <label htmlFor="ad-address" className="micro text-faint">{t('ads.address')}</label>
            <input id="ad-address" value={v.address} onChange={(e) => set({ address: e.target.value })} className={inputCls} placeholder={t('ads.addressPlaceholder')} />
          </div>

          <div>
            <label htmlFor="ad-desc" className="micro text-faint">{t('ads.description')}</label>
            <textarea id="ad-desc" value={v.description} onChange={(e) => set({ description: e.target.value })} rows={4} maxLength={4000} className="mt-1.5 w-full resize-none rounded-md border border-border bg-raised px-3 py-2.5 text-[14px] text-text placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" placeholder={t('ads.descriptionPlaceholder')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ad-contact" className="micro text-faint">{t('ads.contactName')}</label>
              <input id="ad-contact" value={v.contactName} onChange={(e) => set({ contactName: e.target.value })} required minLength={2} className={inputCls} />
            </div>
            <div>
              <label htmlFor="ad-phone" className="micro text-faint">{t('ads.contactPhone')}</label>
              <input id="ad-phone" value={v.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} required dir="ltr" className={`${inputCls} font-mono tnum`} placeholder="+995 5__ __ __ __" />
            </div>
          </div>

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between">
              <span className="micro text-faint">{t('ads.photos')}</span>
              <span className="font-mono text-[10px] text-faint tnum">{v.photos.length}/{MAX_PHOTOS}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {v.photos.map((p, i) => (
                <div key={i} className="relative size-16 overflow-hidden rounded-lg border border-border">
                  <img src={p} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label={t('common.remove')}
                    onClick={() => set({ photos: v.photos.filter((_, j) => j !== i) })}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 text-text opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              {v.photos.length < MAX_PHOTOS ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={compressing}
                  className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-faint transition-colors hover:border-border-strong hover:text-muted"
                >
                  {compressing ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void addPhotos(e.target.files)}
            />
          </div>

          {error ? (
            <p className="font-mono text-[12px] text-danger">{t('common.error')} — {error}</p>
          ) : null}

          <button
            type="submit"
            disabled={busy || compressing}
            className="mt-1 flex h-11 items-center justify-center rounded-md bg-signal text-[14px] font-medium text-[#0B0E0C] transition-[filter] hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
          >
            {busy ? t('common.loading') : v.id ? t('ads.saveChanges') : t('ads.publishCta')}
          </button>
        </form>
      </div>
    </div>
  );
}
