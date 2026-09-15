'use client';

/**
 * Demo-mode radar store — the serverless replacement for Prisma + the
 * scanner mini-service. Everything the local stack persists server-side
 * lives here in localStorage (zustand persist):
 *
 *  - alerts (CRUD, same validation contract as POST /api/alerts);
 *  - `seen`: the dedupe baseline (objectId → last price) — this is what
 *    makes NEW / PRICE_DROP classification stateless;
 *  - notifications feed (latest 50) + delivery prefs;
 *  - lastScanAt / scanning for the status chip and hero chip.
 *
 * `scan()` posts {alerts, seen} to /api/demo/scan and folds the response
 * back in. The very first scan is a silent BASELINE pass (everything is
 * "NEW" to an empty map — notifying about all of it would be spam; this
 * mirrors the local scanner's warm-up cycle).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  matchDemoAlert,
  type DemoAlert,
  type SeenEntry,
} from './match';

// Re-exported for consumers (use-demo) — the store is the demo data layer.
export type { DemoAlert, SeenEntry };

export type DemoNotification = {
  id: string;
  alertId: string | null;
  objectId: number;
  kind: 'NEW' | 'PRICE_DROP' | 'BUMP';
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

export type DemoAlertInput = {
  name: string;
  cityId: number;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  districtIds: number[];
  roomCounts: number[];
};

type DemoPrefs = { browser: boolean; sound: boolean };

type DemoState = {
  alerts: DemoAlert[];
  seen: Record<string, SeenEntry>;
  notifications: DemoNotification[];
  prefs: DemoPrefs;
  baselineDone: boolean;
  lastScanAt: string | null;
  scanning: boolean;

  createAlert: (input: DemoAlertInput) => DemoAlert;
  updateAlert: (id: string, patch: Partial<DemoAlertInput> & { active?: boolean }) => void;
  deleteAlert: (id: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  setPrefs: (patch: Partial<DemoPrefs>) => void;
  /** Runs one stateless scan cycle; returns the NEW notifications (already merged). */
  scan: () => Promise<DemoNotification[]>;
};

const FEED_LIMIT = 50;
const SEEN_LIMIT = 5000;

/** Trim the seen map FIFO-style when it outgrows the cap. */
function capSeen(seen: Record<string, SeenEntry>): Record<string, SeenEntry> {
  const keys = Object.keys(seen);
  if (keys.length <= SEEN_LIMIT) return seen;
  const trimmed: Record<string, SeenEntry> = {};
  for (const key of keys.slice(keys.length - SEEN_LIMIT)) trimmed[key] = seen[key];
  return trimmed;
}

/**
 * Client-side match count for one alert over the observed baseline — the
 * stateless analogue of GET /api/alerts's per-alert matchCount (7-day
 * window via first-seen timestamps kept in each entry).
 */
export function demoMatchCount(
  alert: DemoAlert,
  seen: Record<string, SeenEntry>,
  createdAt: string,
): number {
  const createdMs = new Date(createdAt).getTime();
  let count = 0;
  for (const entry of Object.values(seen)) {
    if (entry.f < createdMs) continue;
    if (
      matchDemoAlert(alert, {
        cityId: entry.c,
        price: entry.p,
        area: entry.a,
        roomCount: entry.r,
        districtId: entry.d,
      })
    ) {
      count++;
    }
  }
  return count;
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      alerts: [],
      seen: {},
      notifications: [],
      prefs: { browser: false, sound: false },
      baselineDone: false,
      lastScanAt: null,
      scanning: false,

      createAlert: (input) => {
        const alert: DemoAlert = {
          id: `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: input.name,
          cityId: input.cityId,
          minPrice: input.minPrice ?? null,
          maxPrice: input.maxPrice ?? null,
          minArea: input.minArea ?? null,
          maxArea: input.maxArea ?? null,
          districtIds: input.districtIds,
          roomCounts: input.roomCounts,
          active: true,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ alerts: [alert, ...s.alerts] }));
        return alert;
      },

      updateAlert: (id, patch) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      deleteAlert: (id) =>
        set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
          ),
        })),

      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.readAt ? n : { ...n, readAt: new Date().toISOString() },
          ),
        })),

      setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),

      scan: async () => {
        const state = get();
        if (state.scanning) return [];
        set({ scanning: true });
        try {
          const res = await fetch('/api/demo/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alerts: state.alerts.map((a) => ({
                id: a.id,
                name: a.name,
                cityId: a.cityId,
                minPrice: a.minPrice,
                maxPrice: a.maxPrice,
                minArea: a.minArea,
                maxArea: a.maxArea,
                districtIds: a.districtIds,
                roomCounts: a.roomCounts,
                active: a.active,
              })),
              seen: state.seen,
            }),
          });
          if (!res.ok) return [];
          const data = (await res.json()) as {
            scannedAt: string;
            observations: {
              objectId: number;
              p: number;
              d: number | null;
              r: number;
              a: number;
              c: number;
            }[];
            notifications: DemoNotification[];
          };

          const now = Date.now();
          const seen = { ...state.seen };
          for (const o of data.observations) {
            const key = String(o.objectId);
            const prev = seen[key];
            seen[key] = {
              p: o.p,
              d: o.d,
              r: o.r,
              a: o.a,
              c: o.c,
              f: prev?.f ?? now,
            };
          }

          // First pass = silent baseline: record everything, notify about nothing.
          const silent = !state.baselineDone;
          const existingIds = new Set(state.notifications.map((n) => n.id));
          const fresh = silent
            ? []
            : data.notifications.filter((n) => !existingIds.has(n.id));

          set({
            seen: capSeen(seen),
            notifications: [...fresh, ...state.notifications].slice(0, FEED_LIMIT),
            lastScanAt: data.scannedAt,
            baselineDone: true,
          });
          return fresh;
        } catch {
          return [];
        } finally {
          set({ scanning: false });
        }
      },
    }),
    {
      name: 'dealradar-demo-store',
      partialize: (s) => ({
        alerts: s.alerts,
        seen: s.seen,
        notifications: s.notifications,
        prefs: s.prefs,
        baselineDone: s.baselineDone,
        lastScanAt: s.lastScanAt,
      }),
    },
  ),
);
