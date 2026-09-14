'use client';

/**
 * DemoRadarRuntime — the serverless stand-in for the scanner mini-service's
 * 90s poll loop. Rendered ONCE (page.tsx, demo builds only); it:
 *
 *  - runs the client-side scan cycle every 90s while the tab is visible
 *    (the first pass is a silent baseline recorded by the store);
 *  - announces fresh matches (toast + browser notification + chime) exactly
 *    like live socket pushes do in the local stack.
 *
 * Renders nothing — it is pure behavior.
 */
import { useEffect, useRef } from 'react';

import { useI18n } from '@/lib/i18n';
import {
  announceMatches,
  fireBrowserNotification,
  playChime,
} from './delivery';
import { useDemoStore } from '@/lib/demo/store';

const SCAN_INTERVAL_MS = 90_000;

export function DemoRadarRuntime() {
  const { t } = useI18n();
  const scan = useDemoStore((s) => s.scan);
  const notifications = useDemoStore((s) => s.notifications);
  const prefs = useDemoStore((s) => s.prefs);

  const scanRef = useRef(scan);
  useEffect(() => {
    scanRef.current = scan;
  }, [scan]);

  const deliveredUpToRef = useRef<string | null>(null);

  // Scan loop: immediate catch-up (if the baseline is stale), then every 90s.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void scanRef.current();
    };

    // Catch-up: scan on boot when the last cycle is older than the interval
    // (or missing entirely — first visit records the baseline).
    const last = useDemoStore.getState().lastScanAt;
    if (!last || Date.now() - new Date(last).getTime() > SCAN_INTERVAL_MS) {
      void scanRef.current();
    }
    const interval = setInterval(tick, SCAN_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Announce fresh matches as they land (skip initial hydration).
  useEffect(() => {
    const top = notifications[0];
    if (!top) return;
    if (deliveredUpToRef.current === null) {
      deliveredUpToRef.current = top.id;
      return;
    }
    if (top.id !== deliveredUpToRef.current) {
      deliveredUpToRef.current = top.id;
      announceMatches([top], {
        new: t('feed.newMatch'),
        drop: t('feed.priceDropMatch'),
        bumped: t('listing.bumped'),
      });
      if (prefs.browser) fireBrowserNotification(top);
      if (prefs.sound) playChime();
    }
  }, [notifications, prefs, t]);

  return null;
}
