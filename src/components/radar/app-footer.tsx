'use client';

/**
 * AppFooter — per design.md §8: hairline top, mono 11px sources status row
 * (korter.ge ● LIVE green / ss.ge ○ BLOCKED / myhome.ge ○ BLOCKED, each with
 * a localized tooltip via sources.*) + faint disclaimer + data attribution.
 */
import { useI18n } from '@/lib/i18n';

export function AppFooter() {
  const { t } = useI18n();

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2.5 px-5 py-6 lg:px-8">
        {/* Sources status row — honest per SourceStatus semantics */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px] tracking-[0.06em]">
          <span
            title={t('sources.korter')}
            className="flex items-center gap-1.5 text-muted"
          >
            <span aria-hidden className="size-[6px] rounded-full bg-signal" />
            korter.ge <span className="text-signal">LIVE</span>
          </span>
          <span
            title={t('sources.ssge')}
            className="flex items-center gap-1.5 text-muted"
          >
            <span aria-hidden className="size-[6px] rounded-full border border-faint" />
            ss.ge <span className="text-faint">BLOCKED</span>
          </span>
          <span
            title={t('sources.myhome')}
            className="flex items-center gap-1.5 text-muted"
          >
            <span aria-hidden className="size-[6px] rounded-full border border-faint" />
            myhome.ge <span className="text-faint">BLOCKED</span>
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-faint">{t('footer.disclaimer')}</p>
        <p className="text-[11px] leading-relaxed text-faint">{t('footer.data')}</p>
      </div>
    </footer>
  );
}
