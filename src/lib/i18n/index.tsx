'use client';

/**
 * DealRadar i18n — client-side localization provider for 6 locales.
 *
 * Locales : en (English) · ka (ქართული) · ru (Русский) · uk (Українська)
 *           he (עברית, RTL) · ar (العربية, RTL)
 *
 * Usage:
 *   // Wrap the client tree once, near the root of the client components:
 *   <I18nProvider>…</I18nProvider>
 *
 *   const { locale, setLocale, t, dir } = useI18n();
 *   t('listing.floor', { n: 5, total: 12 }); // "Floor 5/12"
 *   formatPrice(1250, locale);               // "$1,250" — USD in every locale
 *   formatRelativeTime(publishedAt, t);      // "5m ago" / "לפני 5 דק׳" / …
 *
 * Hydration strategy: the first client render ALWAYS uses the default locale
 * ('en') — exactly what the server rendered — and the locale persisted in
 * localStorage ('dealradar-locale') is adopted inside useEffect only. That
 * keeps SSR markup and the first client paint identical (no hydration
 * mismatch). Effects also keep document.documentElement.dir ('rtl' for he/ar)
 * and document.documentElement.lang in sync with the active locale.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCALE, interpolate, LOCALE_STORAGE_KEY, LOCALES } from './types';
import type { Dictionary, Locale, TranslateFn, TranslationKey } from './types';

import { dict as en } from './en';
import { dict as ka } from './ka';
import { dict as ru } from './ru';
import { dict as uk } from './uk';
import { dict as he } from './he';
import { dict as ar } from './ar';

// Convenience re-exports so app code can import everything i18n-related from
// '@/lib/i18n' in one place.
export { LOCALES, formatPrice, formatRelativeTime } from './types';
export type { Dictionary, I18nVars, Locale, TranslateFn, TranslationKey } from './types';

const DICTS: Record<Locale, Dictionary> = { en, ka, ru, uk, he, ar };

const dirFor = (locale: Locale): 'ltr' | 'rtl' =>
  LOCALES.find((entry) => entry.code === locale)?.dir ?? 'ltr';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Translate a key; {placeholder} tokens are filled from `vars` by simple replacement. */
  t: TranslateFn;
  dir: 'ltr' | 'rtl';
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Warn once per missing key (per page load) to keep the console readable. */
const warnedKeys = new Set<TranslationKey>();

export function I18nProvider({ children }: { children: ReactNode }) {
  // Hydration: always start from the default locale (matches SSR markup),
  // then adopt the persisted locale in an effect — never during render.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Sync the persisted locale after mount (client-only → no SSR mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && stored in DICTS) {
        // localStorage is an external system we read once, after hydration;
        // the update is deferred to a microtask (runs before the next paint)
        // so it doesn't cascade a synchronous render inside the effect body
        // (react-hooks/set-state-in-effect) while still adopting the stored
        // locale before the user can perceive the default one.
        queueMicrotask(() => setLocaleState(stored as Locale));
      }
    } catch {
      // localStorage can be unavailable (private mode, security policy…);
      // falling back to the default locale is always safe.
    }
  }, []);

  const dir = dirFor(locale);

  // Keep <html lang> and <html dir> in sync (dir='rtl' for he/ar) so layout,
  // bidirectional rendering and screen readers follow the active locale
  // across the whole app.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the in-memory locale still switches.
    }
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      // Compile-time typing already guarantees every key exists in every
      // dictionary; this runtime safety net covers exotic cases (HMR, partial
      // dictionaries injected from outside this module): fall back to the
      // English string, and if even that is missing, return the raw key and
      // warn exactly once per key.
      const template =
        (DICTS[locale] as Partial<Dictionary>)[key] ?? (en as Partial<Dictionary>)[key];
      if (template === undefined) {
        if (!warnedKeys.has(key)) {
          warnedKeys.add(key);
          console.warn(`[i18n] Missing translation for key "${key}" (locale: ${locale})`);
        }
        return key;
      }
      return interpolate(template, vars);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, dir }),
    [locale, setLocale, t, dir],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the active locale, its direction, setLocale and the t() function. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider> (wrap your client tree first)');
  }
  return ctx;
}
