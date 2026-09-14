'use client';

/**
 * Demo-mode hook facades — mirror the shapes of useNotifications and the
 * alerts CRUD so components can switch transports with a single isDemo()
 * branch instead of forking their markup:
 *
 *   const live = useNotifications();      // dormant in demo
 *   const demo = useDemoNotifications();  // localStorage-backed
 *   const feed = isDemo() ? demo : live;
 *
 * (Both are always called — unconditional hooks; only the choice varies.)
 */
import { useCallback, useState } from 'react';

import { isDemo } from '@/lib/demo/flags';
import {
  demoMatchCount,
  useDemoStore,
  type DemoAlert,
  type DemoNotification,
  type SeenEntry,
} from '@/lib/demo/store';
import {
  fireBrowserNotification,
  playChime,
  requestBrowserPermission,
} from './delivery';
import type { AlertItem } from './types';
import type { NotificationsApi } from './use-notifications';

/**
 * Demo alert → the shared AlertItem render shape (JSON-string arrays) so
 * both transports feed identical row components.
 */
export function demoAlertToRow(a: DemoAlert, seen: Record<string, SeenEntry>): AlertItem {
  const createdAt = a.createdAt ?? new Date().toISOString();
  return {
    id: a.id,
    name: a.name,
    minPrice: a.minPrice,
    maxPrice: a.maxPrice,
    cityId: a.cityId,
    districtIds: JSON.stringify(a.districtIds),
    roomCounts: JSON.stringify(a.roomCounts),
    minArea: a.minArea,
    maxArea: a.maxArea,
    active: a.active,
    createdAt,
    updatedAt: createdAt,
    matchCount: demoMatchCount(a, seen, createdAt),
  };
}

function toFeedItem(n: DemoNotification) {
  return n; // DemoNotification already matches NotificationItem structurally
}

export function useDemoNotifications(): NotificationsApi {
  const notifications = useDemoStore((s) => s.notifications);
  const prefs = useDemoStore((s) => s.prefs);
  const setPrefs = useDemoStore((s) => s.setPrefs);
  const markReadStore = useDemoStore((s) => s.markRead);
  const markAllReadStore = useDemoStore((s) => s.markAllRead);
  const scan = useDemoStore((s) => s.scan);
  const [browserBlocked, setBrowserBlocked] = useState(false);

  const items = notifications.map(toFeedItem);
  const unreadCount = items.filter((n) => !n.readAt).length;

  const setBrowserEnabled = useCallback(
    (on: boolean) => {
      if (!on) {
        setPrefs({ browser: false });
        return;
      }
      void requestBrowserPermission().then((permission) => {
        if (permission === 'granted') {
          setPrefs({ browser: true });
          setBrowserBlocked(false);
        } else if (permission === 'denied') {
          setBrowserBlocked(true);
        }
      });
    },
    [setPrefs],
  );

  const setSoundEnabled = useCallback(
    (on: boolean) => {
      setPrefs({ sound: on });
      if (on) playChime();
    },
    [setPrefs],
  );

  return {
    items,
    unreadCount,
    loading: false,
    error: null,
    refresh: useCallback(async () => {
      await scan();
    }, [scan]),
    markRead: markReadStore,
    markAllRead: markAllReadStore,
    browserEnabled: prefs.browser,
    soundEnabled: prefs.sound,
    browserBlocked,
    setBrowserEnabled,
    setSoundEnabled,
  };
}

export type DemoAlertsApi = {
  alerts: ReturnType<typeof useDemoStore.getState>['alerts'];
  seen: ReturnType<typeof useDemoStore.getState>['seen'];
  scanning: boolean;
  lastScanAt: string | null;
  matchCount: (alertId: string) => number;
  scanNow: () => Promise<void>;
  toggleActive: (id: string, active: boolean) => void;
  remove: (id: string) => void;
  save: (input: {
    id?: string | null;
    name: string;
    cityId: number;
    minPrice?: number;
    maxPrice?: number;
    minArea?: number;
    maxArea?: number;
    districtIds: number[];
    roomCounts: number[];
  }) => void;
};

export function useDemoAlerts(): DemoAlertsApi {
  const alerts = useDemoStore((s) => s.alerts);
  const seen = useDemoStore((s) => s.seen);
  const scanning = useDemoStore((s) => s.scanning);
  const lastScanAt = useDemoStore((s) => s.lastScanAt);
  const createAlert = useDemoStore((s) => s.createAlert);
  const updateAlert = useDemoStore((s) => s.updateAlert);
  const deleteAlert = useDemoStore((s) => s.deleteAlert);
  const scan = useDemoStore((s) => s.scan);

  const matchCount = useCallback(
    (alertId: string) => {
      const alert = alerts.find((a) => a.id === alertId);
      if (!alert) return 0;
      // Alerts created before this session's baseline only count listings
      // first seen after their creation (same rule as the SQL count).
      return demoMatchCount(alert, seen, alert.createdAt ?? new Date(0).toISOString());
    },
    [alerts, seen],
  );

  return {
    alerts,
    seen,
    scanning,
    lastScanAt,
    matchCount,
    scanNow: useCallback(async () => {
      await scan();
    }, [scan]),
    toggleActive: useCallback(
      (id, active) => updateAlert(id, { active }),
      [updateAlert],
    ),
    remove: deleteAlert,
    save: useCallback(
      (input) => {
        if (input.id) {
          updateAlert(input.id, {
            name: input.name,
            cityId: input.cityId,
            minPrice: input.minPrice,
            maxPrice: input.maxPrice,
            minArea: input.minArea,
            maxArea: input.maxArea,
            districtIds: input.districtIds,
            roomCounts: input.roomCounts,
          });
        } else {
          createAlert({
            name: input.name,
            cityId: input.cityId,
            minPrice: input.minPrice,
            maxPrice: input.maxPrice,
            minArea: input.minArea,
            maxArea: input.maxArea,
            districtIds: input.districtIds,
            roomCounts: input.roomCounts,
          });
        }
      },
      [createAlert, updateAlert],
    ),
  };
}
