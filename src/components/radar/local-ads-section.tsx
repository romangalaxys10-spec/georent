'use client';

/**
 * LocalAdsSection — the owner dashboard: sign in/up entry, my listings
 * (publish / pause / delete), interest leads, Telegram pairing and the
 * API token. Shown as a home-page section, mobile-first.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  BellRing,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  UserRound,
} from 'lucide-react';

import { formatPrice, useI18n } from '@/lib/i18n';
import { authFetch, clearAuth, useAuth, type AuthUser } from '@/lib/auth-client';
import { AuthDialog } from './auth-dialog';
import { AdFormDialog, EMPTY_AD, type AdFormValue } from './ad-form-dialog';

type MyListing = {
  id: string;
  deal: string;
  title: string;
  priceUsd: number;
  area: number;
  roomCount: number;
  districtName: string;
  cityName: string;
  status: string;
  views: number;
  photos: string[];
  interestCount: number;
  createdAt: string;
};

type Interest = {
  id: string;
  listingId: string;
  name: string;
  phone: string;
  message?: string | null;
  readAt?: string | null;
  createdAt: string;
};

type PairState = {
  configured: boolean;
  botUsername: string | null;
  paired: boolean;
  tgUsername: string | null;
  pendingCode: string | null;
};

export function LocalAdsSection() {
  const { t, locale } = useI18n();
  const { user, token } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');

  const [listings, setListings] = useState<MyListing[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [pair, setPair] = useState<PairState | null>(null);
  const [loading, setLoading] = useState(false);
  const [adFormOpen, setAdFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdFormValue>(EMPTY_AD);
  const [showToken, setShowToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [pairing, setPairing] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [adsRes, tgRes] = await Promise.all([
        authFetch('/api/ads'),
        authFetch('/api/telegram/pair'),
      ]);
      if (adsRes.status === 401 || tgRes.status === 401) {
        clearAuth();
        return;
      }
      const ads = (await adsRes.json().catch(() => null)) as { listings?: MyListing[] } | null;
      const tg = (await tgRes.json().catch(() => null)) as PairState | null;
      setListings(ads?.listings ?? []);
      setPair(tg);
      // Interests are derived from the listings payload? No — dedicated fetch.
      const allInterests: Interest[] = [];
      for (const l of ads?.listings ?? []) {
        const ir = await authFetch(`/api/ads/${l.id}/interests`).catch(() => null);
        if (ir?.ok) {
          const ij = (await ir.json().catch(() => null)) as { interests?: Interest[] } | null;
          for (const i of ij?.interests ?? []) allInterests.push(i);
        }
      }
      allInterests.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setInterests(allInterests);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setListingStatus = async (id: string, status: string) => {
    await authFetch(`/api/ads/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    void refresh();
  };

  const removeListing = async (id: string) => {
    if (!window.confirm(t('ads.confirmDelete'))) return;
    await authFetch(`/api/ads/${id}`, { method: 'DELETE' });
    void refresh();
  };

  const startPairing = async () => {
    setPairing(true);
    try {
      await authFetch('/api/telegram/pair', { method: 'POST' });
      void refresh();
    } finally {
      setPairing(false);
    }
  };

  const unpair = async () => {
    await authFetch('/api/telegram/unpair', { method: 'POST' });
    void refresh();
  };

  const markInterestsRead = async () => {
    const unread = interests.filter((i) => !i.readAt);
    for (const i of unread) {
      await authFetch(`/api/ads/${i.listingId}/interests`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [i.id] }),
      }).catch(() => null);
    }
    void refresh();
  };

  // ---- Signed-out state: pitch + entry buttons ----
  // Both views live in ONE return with the dialogs mounted once at the root,
  // so the AuthDialog (holding the one-time signup token reveal) survives the
  // signed-out → signed-in switch.
  const signedOutView = user ? null : (
      <section aria-label={t('ads.title')} className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-5 lg:px-8">
        <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-signal/15">
                <UserRound className="size-4 text-signal" aria-hidden />
              </span>
              <h2 className="text-[17px] font-semibold text-text">{t('ads.title')}</h2>
            </div>
            <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{t('ads.pitch')}</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-muted">
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-1 rounded-full bg-signal" />
                {t('ads.pitchPoint1')}
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-1 rounded-full bg-signal" />
                {t('ads.pitchPoint2')}
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-1 rounded-full bg-signal" />
                {t('ads.pitchPoint3')}
              </li>
            </ul>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setAuthOpen(true);
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-md bg-signal px-6 text-[14px] font-medium text-[#0B0E0C] transition-[filter] hover:brightness-110"
            >
              <Plus className="size-4" aria-hidden />
              {t('ads.createAccount')}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setAuthOpen(true);
              }}
              className="flex h-10 items-center justify-center rounded-md border border-border px-6 text-[13px] text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              {t('auth.signIn')}
            </button>
          </div>
        </div>
      </section>
  );

  // ---- Signed-in dashboard ----
  const dashboardView = user ? (
    <section aria-label={t('ads.title')} className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-5 lg:px-8">
      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-signal/15">
              <UserRound className="size-4.5 text-signal" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-text">{user.name}</h2>
              <p className="truncate text-[12px] text-faint" dir="ltr">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing({ ...EMPTY_AD, contactName: user.name });
                setAdFormOpen(true);
              }}
              className="flex h-9 items-center gap-1.5 rounded-md bg-signal px-3.5 text-[13px] font-medium text-[#0B0E0C] transition-[filter] hover:brightness-110"
            >
              <Plus className="size-4" aria-hidden />
              {t('ads.publishAd')}
            </button>
            <button
              type="button"
              onClick={() => clearAuth()}
              className="flex h-9 items-center rounded-md border border-border px-3 text-[12px] text-muted transition-colors hover:border-danger/50 hover:text-danger"
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>

        {loading && listings.length === 0 ? (
          <p className="mt-6 font-mono text-[12px] text-faint">{t('common.loading')}</p>
        ) : null}

        {/* My listings */}
        <div className="mt-6">
          <h3 className="micro text-muted">{t('ads.myListings')}</h3>
          {listings.length === 0 && !loading ? (
            <p className="mt-2 text-[13px] text-faint">{t('ads.noListings')}</p>
          ) : (
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {listings.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-raised p-3"
                >
                  {l.photos[0] ? (
                    <img src={l.photos[0]} alt="" className="size-14 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface font-mono text-[10px] text-faint">
                      {t('ads.noPhoto')}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <a href={`/listing/local/${l.id}`} className="line-clamp-1 text-[14px] font-medium text-text hover:text-signal">
                      {l.title}
                    </a>
                    <p className="mt-0.5 font-mono text-[11px] text-faint tnum">
                      {formatPrice(l.priceUsd, locale)}/{l.deal === 'rent' ? t('listing.perMonthShort') : ''}
                      {l.deal !== 'rent' ? '' : ''} · {Math.round(l.area)} m² · {l.districtName}
                      {l.status !== 'active' ? ` · ${t('ads.paused')}` : ''}
                    </p>
                    <p className="mt-0.5 flex items-center gap-3 font-mono text-[11px] text-faint tnum">
                      <span className="flex items-center gap-1">
                        <Eye className="size-3" aria-hidden /> {l.views}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="size-3" aria-hidden /> {l.interestCount}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={l.status === 'active' ? t('ads.pause') : t('ads.resume')}
                      onClick={() => void setListingStatus(l.id, l.status === 'active' ? 'paused' : 'active')}
                      className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:text-text"
                    >
                      {l.status === 'active' ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                    </button>
                    <button
                      type="button"
                      aria-label={t('ads.editAd')}
                      onClick={() => {
                        setEditing({
                          id: l.id,
                          deal: l.deal === 'rent' ? 'rent' : 'buy',
                          title: l.title,
                          description: '',
                          priceUsd: String(l.priceUsd),
                          area: String(l.area),
                          roomCount: String(l.roomCount),
                          bedrooms: '',
                          bathrooms: '',
                          floor: '',
                          floorCount: '',
                          condition: '',
                          furnished: '',
                          cityName: l.cityName,
                          districtName: l.districtName,
                          address: '',
                          contactName: user.name,
                          contactPhone: '',
                          photos: l.photos,
                        });
                        setAdFormOpen(true);
                      }}
                      className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:text-text"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t('ads.delete')}
                      onClick={() => void removeListing(l.id)}
                      className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-danger/50 hover:text-danger"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Interests */}
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-[0.1em] text-muted">
              <BellRing className="size-3.5 text-signal" aria-hidden />
              {t('ads.interests')}
              {interests.some((i) => !i.readAt) ? (
                <span className="rounded-full bg-signal px-1.5 font-mono text-[10px] font-semibold text-[#0B0E0C] tnum">
                  {interests.filter((i) => !i.readAt).length}
                </span>
              ) : null}
            </h3>
            {interests.some((i) => !i.readAt) ? (
              <button type="button" onClick={() => void markInterestsRead()} className="text-[12px] text-faint transition-colors hover:text-text">
                {t('ads.markRead')}
              </button>
            ) : null}
          </div>
          {interests.length === 0 ? (
            <p className="mt-2 text-[13px] text-faint">{t('ads.noInterests')}</p>
          ) : (
            <ul className="mt-2.5 flex flex-col gap-2">
              {interests.slice(0, 8).map((i) => {
                const listing = listings.find((l) => l.id === i.listingId);
                return (
                  <li
                    key={i.id}
                    className={`rounded-lg border p-3 ${i.readAt ? 'border-border bg-raised opacity-70' : 'border-signal/40 bg-raised'}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[14px] font-medium text-text">{i.name}</span>
                      <a href={`/listing/local/${i.listingId}`} className="line-clamp-1 max-w-full font-mono text-[11px] text-faint hover:text-signal">
                        {listing?.title ?? i.listingId}
                      </a>
                    </div>
                    <a href={`tel:${i.phone}`} dir="ltr" className="mt-1 block font-mono text-[13px] text-signal tnum">
                      {i.phone}
                    </a>
                    {i.message ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{i.message}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Telegram pairing */}
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-[0.1em] text-muted">
            <Send className="size-3.5 text-signal" aria-hidden />
            {t('ads.telegram')}
          </h3>
          {pair === null ? null : !pair.configured ? (
            <p className="mt-2 text-[13px] leading-relaxed text-faint">{t('ads.tgNotConfigured')}</p>
          ) : pair.paired ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-[13px] text-text">
                <span aria-hidden className="size-[6px] rounded-full bg-signal" />
                {t('ads.tgPaired')}
                {pair.tgUsername ? <span className="text-faint" dir="ltr">· @{pair.tgUsername}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => void unpair()}
                className="h-8 rounded-md border border-border px-3 text-[12px] text-muted transition-colors hover:border-danger/50 hover:text-danger"
              >
                {t('ads.tgUnpair')}
              </button>
            </div>
          ) : pair.pendingCode ? (
            <div className="mt-2.5 rounded-lg border border-signal/40 bg-raised p-3.5">
              <p className="text-[13px] leading-relaxed text-muted">
                {t('ads.tgStep1')}{' '}
                {pair.botUsername ? (
                  <a
                    href={`https://t.me/${pair.botUsername}?start=${pair.pendingCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-signal underline decoration-signal/40 underline-offset-2"
                    dir="ltr"
                  >
                    @{pair.botUsername}
                  </a>
                ) : (
                  t('ads.tgTheBot')
                )}
              </p>
              <p className="mt-2 text-[13px] text-muted">{t('ads.tgStep2')}</p>
              <code className="mt-2 inline-block rounded-md bg-surface px-3 py-1.5 font-mono text-[18px] font-semibold tracking-[0.3em] text-text tnum" dir="ltr">
                /start {pair.pendingCode}
              </code>
              <p className="mt-2 text-[11px] text-faint">{t('ads.tgCodeExpires')}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void startPairing()}
              disabled={pairing}
              className="mt-2.5 flex h-10 items-center gap-2 rounded-md border border-border px-4 text-[13px] text-muted transition-colors hover:border-signal/50 hover:text-signal disabled:opacity-60"
            >
              <Send className="size-3.5" aria-hidden />
              {pairing ? t('common.loading') : t('ads.tgPairCta')}
            </button>
          )}
        </div>

        {/* API token */}
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-[0.1em] text-muted">
            <KeyRound className="size-3.5 text-faint" aria-hidden />
            {t('auth.yourToken')}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded-md bg-raised px-3 py-2 font-mono text-[12px] text-muted tnum" dir="ltr">
              {showToken && token ? token : '••••••••••••••••••••••••••••••••'}
            </code>
            <button
              type="button"
              aria-label={showToken ? t('ads.hideToken') : t('ads.showToken')}
              onClick={() => setShowToken((s) => !s)}
              className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:text-text"
            >
              {showToken ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            </button>
            <button
              type="button"
              aria-label={t('auth.copyToken')}
              onClick={async () => {
                if (!token) return;
                try {
                  await navigator.clipboard.writeText(token);
                  setTokenCopied(true);
                  setTimeout(() => setTokenCopied(false), 1600);
                } catch {
                  /* ignore */
                }
              }}
              className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:text-text"
            >
              {tokenCopied ? <Copy className="size-3.5 text-signal" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-faint">{t('ads.tokenNote')}</p>
        </div>
      </div>
    </section>
  ) : null;

  return (
    <>
      {user ? dashboardView : signedOutView}
      <AdFormDialog
        open={adFormOpen}
        initial={editing}
        onClose={() => setAdFormOpen(false)}
        onSaved={() => void refresh()}
      />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </>
  );
}
