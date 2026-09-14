'use client';

/**
 * LanguageSwitcher — ghost dropdown per design.md §1: Globe icon, endonym
 * labels (ქართული / Русский / …), check mark on the active locale, RTL-aware
 * (logical ms-auto on the check, documentElement.dir handled by the provider).
 */
import { Check, Globe } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import { LOCALES } from '@/lib/i18n/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const current = LOCALES.find((entry) => entry.code === locale) ?? LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('lang.switch')}
          title={t('lang.switch')}
          className="flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted transition-colors hover:bg-accent hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Globe className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">{current.nativeLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-40 border-border">
        {LOCALES.map((entry) => {
          const active = entry.code === locale;
          return (
            <DropdownMenuItem
              key={entry.code}
              onSelect={() => setLocale(entry.code)}
              className="flex items-center justify-between gap-3 text-[13px]"
            >
              <span className={active ? 'text-signal' : undefined}>{entry.nativeLabel}</span>
              {active ? (
                <Check className="ms-auto size-3.5 shrink-0 text-signal" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
