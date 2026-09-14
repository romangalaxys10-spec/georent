'use client';

/**
 * AppFooter — hairline top, mono 11px sources status row fed by the REAL
 * last-known run statuses published by ExploreView (LIVE / DEGRADED / DOWN),
 * + faint disclaimer + data attribution.
 */
import { useI18n } from '@/lib/i18n';
import { useSourceStatuses } from './source-status-store';

const SITE_LABEL: Record<string, string> = {
  korter: 'korter.ge',
  ss: 'ss.ge',
  myhome: 'myhome.ge',
};

const STATUS_LABEL: Record<'ok' | 'degraded' | 'down', { text: string; cls: string; dot: string }> = {
  ok: { text: 'LIVE', cls: 'text-signal', dot: 'bg-signal' },
  degraded: { text: 'DEGRADED', cls: 'text-[#E8A03C]', dot: 'bg-[#E8A03C]' },
  down: { text: 'DOWN', cls: 'text-danger', dot: 'bg-danger' },
};

export function AppFooter() {
  const { t } = useI18n();
  const statuses = useSourceStatuses();

  return (
    <footer className="mt-auto border-t border-border">
      {/* pb clears the mobile filters FAB so it never covers this text */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2.5 px-5 pb-24 pt-6 lg:px-8 lg:pb-6">
        {/* Sources status row — real last-known run status per source */}
        {statuses.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px] tracking-[0.06em]">
            {statuses.map((s) => {
              const meta = STATUS_LABEL[s.status];
              return (
                <span
                  key={s.id}
                  title={`${s.count} listings · ${Math.round(s.durationMs)}ms${s.error ? ` · ${s.error}` : ''}`}
                  className="flex items-center gap-1.5 text-muted"
                >
                  <span aria-hidden className={`size-[6px] rounded-full ${meta.dot}`} />
                  {SITE_LABEL[s.id] ?? s.id} <span className={meta.cls}>{meta.text}</span>
                </span>
              );
            })}
          </div>
        ) : null}

        <p className="text-[11px] leading-relaxed text-faint">{t('footer.disclaimer')}</p>
        <p className="text-[11px] leading-relaxed text-faint">{t('footer.data')}</p>
      </div>
    </footer>
  );
}
