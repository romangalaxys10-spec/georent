'use client';

/**
 * useNotifications — single source of truth for the LIVE notification feed:
 *
 * - loads GET /api/notifications on mount (latest 50 + unreadCount);
 * - merges live `new_matches` pushes from the scanner socket, deduped by
 *   record id (a record fetched by refetch must never appear twice);
 * - markRead(id) / markAllRead() patch the local state optimistically from
 *   the POST response's fresh unreadCount;
 * - delivery extras, both OFF by default and persisted to localStorage:
 *     · browser notifications (Notification API, permission requested on
 *       toggle-on; if denied, `browserBlocked` explains it in the UI);
 *     · a short two-tone chime via WebAudio (no audio asset needed).
 *
 * In DEMO mode (NEXT_PUBLIC_DEMO_MODE=1, e.g. the Vercel deployment) this
 * hook goes dormant — `useDemoNotifications` owns the feed from the
 * client-side baseline instead; both are mounted unconditionally and the
 * consumer picks, so this hook must never fetch or subscribe there.
 */
import { useCallback, useEffect, useState } from 'react';

import { useI18n } from '@/lib/i18n';
import { isDemo } from '@/lib/demo/flags';
import {
  announceMatches,
  fireBrowserNotification,
  playChime,
  requestBrowserPermission,
} from './delivery';
import { useScannerEvent } from './scanner-socket';
import type { NewMatchItem, NewMatchesPayload } from './scanner-socket';
import { useUiStore } from './ui-store';

export type NotificationKind = 'NEW' | 'PRICE_DROP' | 'BUMP';

/** Normalized feed row — covers both API rows and socket-pushed matches. */
export type NotificationItem = {
  id: string;
  alertId: string | null;
  objectId: number;
  kind: NotificationKind;
  price: number;
  previousPrice: number | null;
  title: string;
  createdAt: string;
  readAt: string | null;
  alertName: string | null;
  link: string | null;
  image: string | null;
  districtName: string | null;
  address: string | null;
};

export type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

const BROWSER_KEY = 'dealradar-notify-browser';
const SOUND_KEY = 'dealradar-notify-sound';

const readPref = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const writePref = (key: string, value: boolean): void => {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // best-effort persistence only
  }
};

/** Shared return shape — `useDemoNotifications` mirrors this exactly. */
export type NotificationsApi = {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => void | Promise<void>;
  markAllRead: () => void | Promise<void>;
  browserEnabled: boolean;
  soundEnabled: boolean;
  browserBlocked: boolean;
  setBrowserEnabled: (on: boolean) => void;
  setSoundEnabled: (on: boolean) => void;
};

export function useNotifications(): NotificationsApi {
  const { t } = useI18n();
  const bumpAlertsVersion = useUiStore((s) => s.bumpAlertsVersion);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(!isDemo());
  const [error, setError] = useState<string | null>(null);

  const [browserEnabled, setBrowserEnabledState] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(false);
  const [browserBlocked, setBrowserBlocked] = useState(false);

  const mergePushed = useCallback((payload: NewMatchesPayload) => {
    const incoming = payload.notifications ?? [];
    if (incoming.length === 0) return;
    setItems((prev) => {
      const seen = new Set(prev.map((n) => n.id));
      const fresh = incoming
        .filter((n) => !seen.has(n.id))
        .map(
          (n: NewMatchItem): NotificationItem => ({
            id: n.id,
            alertId: n.alertId,
            objectId: n.objectId,
            kind: n.kind,
            price: n.price,
            previousPrice: n.previousPrice,
            title: n.title,
            createdAt: n.createdAt,
            readAt: null,
            alertName: n.alertName ?? null,
            link: n.link ?? null,
            image: n.image ?? null,
            districtName: null,
            address: null,
          }),
        );
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 50);
    });
    setUnreadCount(payload.unreadCount);
  }, []);

  // Live pushes → merge + announce + browser notification + chime.
  useScannerEvent('new_matches', (payload) => {
    mergePushed(payload);
    // Match counts in the alerts rail just changed — refresh them.
    bumpAlertsVersion();
    if (payload.notifications.length === 0) return;
    announceMatches(payload.notifications, {
      new: t('feed.newMatch'),
      drop: t('feed.priceDropMatch'),
      bumped: t('listing.bumped'),
    });
    const first = payload.notifications[0];
    if (readPref(BROWSER_KEY)) fireBrowserNotification(first);
    if (readPref(SOUND_KEY)) playChime();
  });

  // Initial load (skipped in demo mode — the demo store owns the feed).
  useEffect(() => {
    if (isDemo()) return;
    const ctrl = new AbortController();
    queueMicrotask(() => setLoading(true));

    fetch('/api/notifications', { signal: ctrl.signal })
      .then(async (res) => {
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return json as NotificationsResponse;
      })
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setItems(data.notifications);
        setUnreadCount(data.unreadCount);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted || (err instanceof DOMException && err.name === 'AbortError'))
          return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, []);

  // Adopt delivery prefs after mount (localStorage is client-only).
  // queueMicrotask keeps the effect body free of synchronous setState
  // (same pattern as use-fetch / I18nProvider) while still landing before
  // the next paint.
  useEffect(() => {
    queueMicrotask(() => {
      setBrowserEnabledState(readPref(BROWSER_KEY));
      setSoundEnabledState(readPref(SOUND_KEY));
    });
  }, []);

  const refresh = useCallback(async () => {
    if (isDemo()) return;
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = (await res.json()) as NotificationsResponse;
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silent — the feed keeps showing what it has
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { unreadCount: number };
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // optimistic state stays; next refresh reconciles
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    setUnreadCount(0);
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all' }),
      });
      if (res.ok) {
        const data = (await res.json()) as { unreadCount: number };
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // optimistic state stays; next refresh reconciles
    }
  }, []);

  const setBrowserEnabled = useCallback((on: boolean) => {
    if (!on) {
      writePref(BROWSER_KEY, false);
      setBrowserEnabledState(false);
      return;
    }
    void requestBrowserPermission().then((permission) => {
      if (permission === 'granted') {
        writePref(BROWSER_KEY, true);
        setBrowserEnabledState(true);
        setBrowserBlocked(false);
      } else if (permission === 'denied') {
        setBrowserBlocked(true);
      }
    });
  }, []);

  const setSoundEnabled = useCallback((on: boolean) => {
    writePref(SOUND_KEY, on);
    setSoundEnabledState(on);
    if (on) playChime(); // instant audible confirmation of the toggle
  }, []);

  return {
    items,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    browserEnabled,
    soundEnabled,
    browserBlocked,
    setBrowserEnabled,
    setSoundEnabled,
  };
}
