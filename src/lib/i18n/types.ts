/**
 * i18n types, locale registry, and formatting helpers for DealRadar Georgia.
 *
 * Locales: en (English), ka (Georgian), ru (Russian), uk (Ukrainian),
 * he (Hebrew, RTL), ar (Arabic, RTL).
 *
 * English (en.ts) is the SOURCE OF TRUTH for the key set. `TranslationKey`
 * and `Dictionary` are derived from the inferred shape of the English
 * literal, so any dictionary file annotated with `Dictionary` fails to
 * compile if it is missing a key or invents one. `scripts/check-i18n.ts`
 * re-verifies the same parity at runtime (placeholder parity included).
 */
import type { English } from './en';

// ---------------------------------------------------------------------------
// Locale registry
// ---------------------------------------------------------------------------

export type Locale = 'en' | 'ka' | 'ru' | 'uk' | 'he' | 'ar';

export const LOCALES: {
  code: Locale;
  /** English name — useful for tooltips / aria-labels in a language switcher. */
  label: string;
  /** Endonym — shown inside the language switcher. */
  nativeLabel: string;
  /** Writing direction; he/ar render right-to-left. */
  dir: 'ltr' | 'rtl';
}[] = [
  { code: 'en', label: 'English',   nativeLabel: 'English',    dir: 'ltr' },
  { code: 'ka', label: 'Georgian',  nativeLabel: 'ქართული',    dir: 'ltr' },
  { code: 'ru', label: 'Russian',   nativeLabel: 'Русский',    dir: 'ltr' },
  { code: 'uk', label: 'Ukrainian', nativeLabel: 'Українська', dir: 'ltr' },
  { code: 'he', label: 'Hebrew',    nativeLabel: 'עברית',      dir: 'rtl' },
  { code: 'ar', label: 'Arabic',    nativeLabel: 'العربية',    dir: 'rtl' },
];

export const DEFAULT_LOCALE: Locale = 'en';

/** localStorage key the chosen locale is persisted under. */
export const LOCALE_STORAGE_KEY = 'dealradar-locale';

// ---------------------------------------------------------------------------
// Dictionary typing — key parity is enforced by the compiler
// ---------------------------------------------------------------------------
// Typing note: en.ts declares its raw literal WITHOUT a `Dictionary`
// annotation first and exports its inferred shape as `English`; only then
// does it export the annotated `dict: Dictionary`. Deriving Dictionary from
// `typeof dict` while `dict` itself is annotated with `Dictionary` would be a
// circular type reference that TypeScript rejects — the two-step below keeps
// `export const dict: Dictionary` intact for every locale file.

/** Every translatable string key, e.g. 'filters.budget'. */
export type TranslationKey = English extends never ? never : keyof English;

/** A complete dictionary: every TranslationKey must map to exactly one string. */
export type Dictionary = Record<TranslationKey, string>;

// ---------------------------------------------------------------------------
// Runtime helpers
// ---------------------------------------------------------------------------

/** Values for {placeholder} interpolation. */
export type I18nVars = Record<string, string | number>;

/**
 * Fills {name} placeholders by SIMPLE STRING REPLACEMENT — deliberately no
 * ICU / Intl.MessageFormat. Example:
 *
 *   interpolate('Floor {n}/{total}', { n: 5, total: 12 }) // "Floor 5/12"
 *
 * Unknown placeholder names are left untouched, so a broken template stays
 * visible in the UI instead of silently rendering empty text.
 */
export const interpolate = (template: string, vars?: I18nVars): string => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (token: string, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : token,
  );
};

/** Signature of the translate function exposed by useI18n(). */
export type TranslateFn = (key: TranslationKey, vars?: I18nVars) => string;

/**
 * Formats a USD price for ANY locale: 'en-US' digit grouping + a literal "$"
 * prefix, e.g. $1,250.
 *
 * Prices on DealRadar are always USD, so we intentionally do NOT switch to
 * locale-specific currency symbols (₪ / ₽ / ₴ / ₾ …) — those would wrongly
 * imply the amount is in the user's local currency. `locale` stays in the
 * signature so call sites can pass the active locale today and a locale-aware
 * variant can be introduced later without churn.
 */
export const formatPrice = (n: number, locale?: Locale): string => {
  void locale; // intentionally unused — see docblock
  return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)}`;
};

/**
 * Renders a past timestamp as feed-relative text using the localized feed.*
 * keys: feed.justNow (< 1 min), feed.minAgo, feed.hourAgo, feed.dayAgo.
 *
 *   formatRelativeTime(Date.now() - 5 * 60_000, t)
 *   // → t('feed.minAgo', { n: 5 }) → "5m ago" / "לפני 5 דק׳" / "5 мин. назад"
 *
 * `then` may be a Date, an epoch-milliseconds number, or an ISO timestamp
 * string (what JSON APIs and socket payloads actually deliver — subtracting
 * a raw string from Date.now() would yield NaN). Anything in the future
 * (or younger than a minute) renders as feed.justNow.
 */
export const formatRelativeTime = (then: Date | number | string, t: TranslateFn): string => {
  const thenMs =
    then instanceof Date
      ? then.getTime()
      : typeof then === 'string'
        ? new Date(then).getTime()
        : then;
  const minutes = Math.floor((Date.now() - thenMs) / 60_000);
  if (minutes < 1) return t('feed.justNow');
  if (minutes < 60) return t('feed.minAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('feed.hourAgo', { n: hours });
  return t('feed.dayAgo', { n: Math.floor(hours / 24) });
};
