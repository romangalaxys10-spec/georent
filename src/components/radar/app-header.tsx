'use client';

/**
 * AppHeader — sticky 52px terminal header per design.md §1:
 * left: DEALRADAR wordmark (Geist Mono 13px, tracking .15em) + 7px live dot
 * (pulsing when the socket is live); right: scanner status chip (mono micro),
 * LanguageSwitcher, and the NotificationBell (unread badge + feed sheet).
 */
import { useI18n, formatRelativeTime } from '@/lib/i18n';
import { useScannerStatus, type ScannerStatus } from './use-scanner-status';
import { LanguageSwitcher } from './language-switcher';
import { NotificationBell } from './notification-bell';

const DOT_BY_STATUS: Record<ScannerStatus, string> = {
  live: 'bg-signal',
  connecting: 'bg-drop',
  offline: 'bg-danger',
};

const CHIP_TEXT_BY_STATUS: Record<ScannerStatus, string> = {
  live: 'var(--signal)',
  connecting: 'var(--drop)',
  offline: 'var(--danger)',
};

export function AppHeader({ status: statusProp }: { status?: ScannerStatus }) {
  const { t } = useI18n();
  const { status: hookStatus, lastScanAt } = useScannerStatus();
  const status = statusProp ?? hookStatus;

  return (
    <header className="sticky top-0 z-40 h-[52px] border-b border-border bg-[rgba(11,14,12,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-3 px-5 lg:px-8">
        {/* Wordmark + live dot */}
        <a
          href="/"
          className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span
            aria-hidden
            className={`size-[7px] shrink-0 rounded-full ${DOT_BY_STATUS[status]} ${
              status === 'live' ? 'animate-pulse-dot' : ''
            }`}
          />
          <span className="truncate font-mono text-[13px] font-semibold uppercase tracking-[0.15em] text-text">
            DealRadar
          </span>
        </a>

        {/* Right cluster: scanner chip · language · bell */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Scanner status chip — micro mono, terminal texture */}
          <span
            className="hidden items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] md:flex"
            style={{ color: CHIP_TEXT_BY_STATUS[status] }}
            role="status"
          >
            <span
              aria-hidden
              className={`size-[5px] rounded-full ${DOT_BY_STATUS[status]} ${
                status !== 'offline' ? 'animate-pulse-dot' : ''
              }`}
            />
            {status === 'live'
              ? `LIVE · SCAN ${lastScanAt ? formatRelativeTime(lastScanAt, t).toUpperCase() : '—'}`
              : status === 'connecting'
                ? 'CONNECTING…'
                : 'OFFLINE'}
          </span>

          <LanguageSwitcher />

          {/* Live notifications: unread badge + feed sheet (Task 6) */}
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
