'use client';

/**
 * scanner-socket — module-singleton socket.io connection to the scanner
 * mini-service (port 3030 through the Caddy XTransformPort gateway) plus a
 * tiny event bus on top of it.
 *
 * Why a singleton: both the header status chip and the notification feed
 * need the same live connection; one socket per page, N subscribers.
 * State snapshot lives on globalThis so hot reloads keep a single coherent
 * instance (same pattern as the scanner mini-service itself).
 *
 * Subscribing from React:
 *   const { status, lastScanAt, scansCount } = useScannerStatus();
 *   useScannerEvent('new_matches', (payload) => { ... });
 *
 * Connection config follows the sanctioned example (examples/websocket):
 * NEVER put a port in the URL — the `XTransformPort` query param is what
 * Caddy uses to forward to the right service; and the engine.io path is not
 * changed from the client default.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

import { isDemo } from '@/lib/demo/flags';
import { useDemoStore } from '@/lib/demo/store';

export type ScannerStatus = 'connecting' | 'live' | 'offline';

export type ScanStatusPayload = {
  lastScanAt: string | null;
  newListings: number;
  priceDrops: number;
  scansCount: number;
  trackedTotal: number;
};

/** One matched-listing notification pushed by the scanner (`new_matches`). */
export type NewMatchItem = {
  id: string;
  alertId: string;
  alertName: string;
  objectId: number;
  kind: 'NEW' | 'PRICE_DROP' | 'BUMP';
  price: number;
  previousPrice: number | null;
  title: string;
  createdAt: string;
  link: string;
  image: string | null;
};

export type NewMatchesPayload = {
  notifications: NewMatchItem[];
  unreadCount: number;
};

export type ScannerEventMap = {
  scan_status: ScanStatusPayload;
  new_matches: NewMatchesPayload;
};

export type ScannerSnapshot = {
  status: ScannerStatus;
  /** ISO timestamp of the last completed scan (null until one completes). */
  lastScanAt: string | null;
  scansCount: number;
};

const DEFAULT_SNAPSHOT: ScannerSnapshot = {
  status: 'connecting',
  lastScanAt: null,
  scansCount: 0,
};

// ---------------------------------------------------------------------------
// globalThis-backed singletons (survive hot reloads, stay out of module scope)
// ---------------------------------------------------------------------------

type ScannerGlobal = typeof globalThis & {
  __dealradarSocket?: Socket;
  __dealradarStatusListeners?: Set<() => void>;
  __dealradarSnapshot?: ScannerSnapshot;
  __dealradarEventListeners?: Map<string, Set<(payload: unknown) => void>>;
};

const g = globalThis as ScannerGlobal;

function statusListeners(): Set<() => void> {
  if (!g.__dealradarStatusListeners) g.__dealradarStatusListeners = new Set();
  return g.__dealradarStatusListeners;
}

function eventListeners(): Map<string, Set<(payload: unknown) => void>> {
  if (!g.__dealradarEventListeners) g.__dealradarEventListeners = new Map();
  return g.__dealradarEventListeners;
}

function getSnapshot(): ScannerSnapshot {
  if (!g.__dealradarSnapshot) g.__dealradarSnapshot = { ...DEFAULT_SNAPSHOT };
  return g.__dealradarSnapshot;
}

function setSnapshot(patch: Partial<ScannerSnapshot>): void {
  g.__dealradarSnapshot = { ...getSnapshot(), ...patch };
  for (const listener of statusListeners()) listener();
}

function dispatchEvent<K extends keyof ScannerEventMap>(
  event: K,
  payload: ScannerEventMap[K],
): void {
  const set = eventListeners().get(event);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(payload);
    } catch {
      // A broken subscriber must never take the socket loop down.
    }
  }
}

function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  // Serverless demo: there is no scanner service to reach — the client-side
  // scan loop (DemoRadarRuntime) owns liveness instead.
  if (isDemo()) return null;
  if (g.__dealradarSocket) return g.__dealradarSocket;

  // Sanctioned gateway pattern: XTransformPort query param, default path.
  const socket = io('/?XTransformPort=3030', {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    timeout: 10_000,
  });

  socket.on('connect', () => setSnapshot({ status: 'live' }));
  socket.on('disconnect', () => setSnapshot({ status: 'offline' }));
  socket.on('connect_error', () => setSnapshot({ status: 'offline' }));

  socket.on('scan_status', (payload: ScanStatusPayload) => {
    setSnapshot({
      lastScanAt: payload.lastScanAt ?? null,
      scansCount: payload.scansCount ?? getSnapshot().scansCount,
    });
    dispatchEvent('scan_status', payload);
  });

  socket.on('new_matches', (payload: NewMatchesPayload) => {
    dispatchEvent('new_matches', payload);
  });

  socket.io.on('reconnect_attempt', () => setSnapshot({ status: 'connecting' }));

  g.__dealradarSocket = socket;
  return socket;
}

// ---------------------------------------------------------------------------
// React bindings
// ---------------------------------------------------------------------------

/** Live scanner connection state for useSyncExternalStore. */
function subscribe(onChange: () => void): () => void {
  getSocket(); // lazily opens the connection on first subscriber (null in demo)
  const set = statusListeners();
  set.add(onChange);
  return () => set.delete(onChange);
}

export function useScannerStatus(): ScannerSnapshot {
  const demoLastScan = useDemoStore((s) => s.lastScanAt);
  const demoScanning = useDemoStore((s) => s.scanning);
  const live = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SNAPSHOT);

  // Demo builds reflect the client-side scan loop instead of the socket.
  if (isDemo()) {
    const fresh =
      demoLastScan !== null &&
      Date.now() - new Date(demoLastScan).getTime() < 5 * 60_000;
    return {
      status: demoScanning || !fresh ? 'connecting' : 'live',
      lastScanAt: demoLastScan,
      scansCount: 0,
    };
  }
  return live;
}

/**
 * Subscribe to a scanner socket event. The handler is kept in a ref, so the
 * subscription survives re-renders without resubscribing (and the handler
 * always sees fresh props/state).
 */
export function useScannerEvent<K extends keyof ScannerEventMap>(
  event: K,
  handler: (payload: ScannerEventMap[K]) => void,
): void {
  const handlerRef = useRef(handler);

  // Keep the ref pointing at the latest handler WITHOUT writing during
  // render (react-hooks/refs) — the subscription itself is stable.
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const listener = (payload: unknown) => {
      (handlerRef.current as (p: unknown) => void)(payload);
    };
    let set = eventListeners().get(event);
    if (!set) {
      set = new Set();
      eventListeners().set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }, [event]);
}
