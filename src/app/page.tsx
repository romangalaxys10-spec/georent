'use client';

/**
 * DealRadar — "Signal Terminal" app shell (design.md §Layout grammar):
 * sticky 52px header · grid [280px rail | 1fr feed] on lg+ (single column on
 * mobile, filters collapse into a bottom sheet behind a sticky pill) ·
 * compact hero + stat chips · 2-col listing feed · footer pinned via mt-auto.
 *
 * Filter state is lifted here so the rail (desktop) and the sheet (mobile)
 * stay in sync with the feed.
 */
import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { useI18n } from '@/lib/i18n';
import { isDemo } from '@/lib/demo/flags';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { AppHeader } from '@/components/radar/app-header';
import { AppFooter } from '@/components/radar/app-footer';
import { FiltersPanel, DEFAULT_FILTERS, type FiltersState } from '@/components/radar/filters-panel';
import { HeroStats } from '@/components/radar/stat-chips';
import { ExploreView } from '@/components/radar/explore-view';
import { AlertsSection } from '@/components/radar/alerts-section';
import { AlertDialogForm } from '@/components/radar/alert-dialog-form';
import { DemoRadarRuntime } from '@/components/radar/demo-runtime';

export default function Home() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Serverless demo: client-side scan loop + match announcements */}
      {isDemo() ? <DemoRadarRuntime /> : null}

      <AppHeader />

      <div className="mx-auto grid w-full max-w-[1440px] flex-1 items-start gap-6 px-5 py-6 lg:grid-cols-[280px_1fr] lg:px-8">
        {/* Left rail — filters + alerts live here permanently on desktop */}
        <aside className="hidden lg:sticky lg:top-[68px] lg:block lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto lg:pe-1">
          <div className="flex flex-col gap-4">
            <FiltersPanel value={filters} onChange={setFilters} />
            <AlertsSection />
          </div>
        </aside>

        {/* Feed column */}
        <main className="flex min-w-0 flex-col gap-6">
          <HeroStats cityId={filters.cityId} />
          <ExploreView value={filters} onChange={setFilters} />
        </main>
      </div>

      {/* Mobile: filters collapse into a bottom sheet behind a sticky pill */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] end-5 z-40 flex h-11 items-center gap-2 rounded-full bg-signal px-4 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0B0E0C] shadow-lg shadow-black/40 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {t('filters.title')}
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[88vh] gap-0 overflow-y-auto rounded-t-2xl border-border bg-bg px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:max-w-none"
        >
          <SheetTitle className="sr-only">{t('filters.title')}</SheetTitle>
          <div className="flex flex-col gap-4">
            <FiltersPanel
              value={filters}
              onChange={setFilters}
              onApplied={() => setSheetOpen(false)}
            />
            <AlertsSection />
          </div>
        </SheetContent>
      </Sheet>

      {/* One shared create/edit-alert dialog (opened from hero CTA, rail, sheet) */}
      <AlertDialogForm />

      <AppFooter />
    </div>
  );
}
