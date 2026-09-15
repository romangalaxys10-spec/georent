'use client';

/**
 * Client-side auth store for local ads — token persisted in localStorage
 * ('dealradar-auth'), shared across components via useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  tgPaired: boolean;
  tgUsername?: string;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
};

const KEY = 'dealradar-auth';
const EVENT = 'dealradar-auth-change';

function read(): AuthState {
  if (typeof window === 'undefined') return { token: null, user: null };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as AuthState;
    if (parsed && typeof parsed.token === 'string' && parsed.user) return parsed;
    return { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

let snapshot: AuthState = { token: null, user: null };

const listeners = new Set<() => void>();

function emit() {
  snapshot = read();
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  snapshot = read();
  window.addEventListener(EVENT, emit);
  window.addEventListener('storage', emit);
}

export function saveAuth(token: string, user: AuthUser): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ token, user }));
  } catch {
    /* ignore */
  }
  emit();
}

export function clearAuth(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function getAuthToken(): string | null {
  return read().token;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Authorized fetch helper — attaches the bearer token. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
