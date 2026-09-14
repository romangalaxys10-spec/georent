/**
 * i18n parity check for DealRadar Georgia.
 *
 * Asserts that all 6 locale dictionaries (en, ka, ru, uk, he, ar) expose
 * EXACTLY the same key set as English, keep {placeholder} parity, contain no
 * empty values, and that the shared formatting helpers behave as documented.
 * Prints per-locale stats and finishes with PASS or FAIL (exit code 1).
 *
 * Run: bun scripts/check-i18n.ts
 */
/// <reference types="bun-types" />

import { dict as en } from '../src/lib/i18n/en';
import { dict as ka } from '../src/lib/i18n/ka';
import { dict as ru } from '../src/lib/i18n/ru';
import { dict as uk } from '../src/lib/i18n/uk';
import { dict as he } from '../src/lib/i18n/he';
import { dict as ar } from '../src/lib/i18n/ar';
import { formatPrice, formatRelativeTime, LOCALES } from '../src/lib/i18n/types';
import type { Locale, TranslateFn, TranslationKey } from '../src/lib/i18n/types';

// Runtime view: deliberately widen the compile-time-exact Dictionary to
// Record<string, string> so this script can DETECT key drift (extra/missing
// keys) instead of trusting the type system alone — defense in depth.
const DICTS = { en, ka, ru, uk, he, ar } as Record<Locale, Record<string, string>>;

let failures = 0;
const fail = (message: string): void => {
  failures += 1;
  console.error(`  ✗ ${message}`);
};

/** Sorted {placeholder} names inside a template, e.g. ['n', 'total']. */
const placeholderNames = (template: string): string[] =>
  [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const enKeys = Object.keys(DICTS.en).sort();

console.log(`i18n parity check — ${enKeys.length} keys in en (source of truth)`);

for (const { code, nativeLabel, dir } of LOCALES) {
  const map = DICTS[code];
  const keys = Object.keys(map).sort();

  const missing = enKeys.filter((key) => !(key in map));
  const extra = keys.filter((key) => !(key in DICTS.en));
  const empty = keys.filter((key) => map[key].trim().length === 0);

  if (missing.length > 0) fail(`${code}: missing ${missing.length} key(s): ${missing.join(', ')}`);
  if (extra.length > 0) fail(`${code}: extra ${extra.length} key(s): ${extra.join(', ')}`);
  if (empty.length > 0) fail(`${code}: empty value(s): ${empty.join(', ')}`);

  // {n} / {total} placeholders present in en must survive every translation.
  for (const key of enKeys) {
    const expected = placeholderNames(DICTS.en[key]).join(',');
    const actual = placeholderNames(map[key] ?? '').join(',');
    if (expected !== actual) {
      fail(`${code}: placeholder mismatch on "${key}" (en: {${expected}} vs ${code}: {${actual}})`);
    }
  }

  console.log(`  ${code} (${nativeLabel}, ${dir}): ${keys.length} keys`);
}

// --- formatting helper smoke tests -------------------------------------------

const priceEn = formatPrice(1250, 'en');
if (priceEn !== '$1,250') {
  fail(`formatPrice(1250, 'en') → "${priceEn}" (expected "$1,250")`);
}

const priceAr = formatPrice(1250, 'ar');
if (priceAr !== '$1,250') {
  fail(`formatPrice(1250, 'ar') → "${priceAr}" (expected "$1,250" — no locale currency symbols)`);
}

const priceRounded = formatPrice(1234567.89, 'he');
if (priceRounded !== '$1,234,568') {
  fail(`formatPrice(1234567.89, 'he') → "${priceRounded}" (expected "$1,234,568")`);
}

const passthrough: TranslateFn = (key: TranslationKey) => key;
const rel = (msAgo: number): string => formatRelativeTime(Date.now() - msAgo, passthrough);
if (rel(30_000) !== 'feed.justNow') {
  fail(`formatRelativeTime(30s) → "${rel(30_000)}" (expected "feed.justNow")`);
}
if (rel(5 * 60_000) !== 'feed.minAgo') {
  fail(`formatRelativeTime(5m) → "${rel(5 * 60_000)}" (expected "feed.minAgo")`);
}
if (rel(5 * 3_600_000) !== 'feed.hourAgo') {
  fail(`formatRelativeTime(5h) → "${rel(5 * 3_600_000)}" (expected "feed.hourAgo")`);
}
if (rel(3 * 86_400_000) !== 'feed.dayAgo') {
  fail(`formatRelativeTime(3d) → "${rel(3 * 86_400_000)}" (expected "feed.dayAgo")`);
}

if (failures > 0) {
  console.error(`FAIL — ${failures} problem(s) found`);
  process.exit(1);
}

console.log('PASS');
