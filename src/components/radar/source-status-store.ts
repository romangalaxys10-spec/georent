'use client';

/**
 * Tiny shared store for the last-known per-source run statuses.
 * ExploreView publishes after every live search; the footer (and any other
 * chrome) subscribes via useSyncExternalStore — no polling, always in sync.
 */
import { useSyncExternalStore } from 'react';

import type { ProviderRunStatus } from '@/lib/providers/types';

const g = globalThis as unknown as {
  __sourceStatuses?: ProviderRunStatus[];
  __sourceStatusListeners?: Set<() => void>;
};

function listeners(): Set<() => void> {
  if (!g.__sourceStatusListeners) g.__sourceStatusListeners = new Set();
  return g.__sourceStatusListeners;
}

export function publishSourceStatuses(next: ProviderRunStatus[]): void {
  g.__sourceStatuses = next;
  for (const fn of listeners()) fn();
}

function subscribe(cb: () => void): () => void {
  listeners().add(cb);
  return () => listeners().delete(cb);
}

/** Stable empty array — getServerSnapshot must not allocate a new one per call. */
const EMPTY: ProviderRunStatus[] = [];

function snapshot(): ProviderRunStatus[] {
  return g.__sourceStatuses ?? EMPTY;
}

export function useSourceStatuses(): ProviderRunStatus[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
