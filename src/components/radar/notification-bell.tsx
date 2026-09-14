'use client';

/**
 * NotificationBell — header bell (unread badge in amber, the alerts token)
 * opening a right-side sheet with the live notification feed:
 *
 * - rows: thumbnail · kind chip (NEW green / PRICE DROP amber with −%) ·
 *   title · price (previous price struck through on drops) · alert name ·
 *   mono relative time · unread accent dot; clicking a row marks it read
 *   and opens the listing on Korter;
 * - "Mark all read" in the header when anything is unread;
 * - footer: delivery toggles (browser notifications + sound) with the
 *   blocked-permission hint when the browser denied the request;
 * - empty state: pulsing signal dot + "Listening for matches".
 */
import { Bell } from 'lucide-react';

import { formatPrice, formatRelativeTime, useI18n } from '@/lib/i18n';
import { isDemo } from '@/lib/demo/flags';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useNotifications, type NotificationItem } from './use-notifications';
import { useDemoNotifications } from './use-demo';

/** Kind chip: color + label per token semantics (green=new, amber=drop). */
function KindChip({ item }: { item: NotificationItem }) {
  const { t } = useI18n();
  if (item.kind === 'NEW') {
    return (
      <span className="rounded-md bg-signal-dim px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-signal">
        {t('listing.new')}
      </span>
    );
  }
  if (item.kind === 'PRICE_DROP') {
    const pct =
      item.previousPrice && item.previousPrice > item.price
        ? Math.round((1 - item.price / item.previousPrice) * 100)
        : null;
    return (
      <span className="rounded-md bg-drop-dim px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-drop tnum">
        {t('feed.priceDropMatch')}
        {pct !== null && pct > 0 ? ` −${pct}%` : ''}
      </span>
    );
  }
  return (
    <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
      {t('listing.bumped')}
    </span>
  );
}

function FeedRow({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  const { t, locale } = useI18n();
  const unread = !item.readAt;
  const body = (
    <>
      {/* Thumbnail (or district monogram fallback) */}
      {item.image ? (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          width={88}
          height={88}
          className="size-11 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-raised font-mono text-[11px] uppercase text-faint"
        >
          {(item.districtName ?? item.title ?? '?').slice(0, 2)}
        </span>
      )}

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <KindChip item={item} />
          <span className="ms-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-faint tnum">
            {formatRelativeTime(item.createdAt, t)}
          </span>
        </span>
        <span className="truncate text-[13px] leading-snug text-text">
          {item.districtName ?? item.title}
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-[13px] font-semibold text-text tnum">
            {formatPrice(item.price, locale)}
          </span>
          {item.previousPrice && item.previousPrice > item.price ? (
            <span className="truncate font-mono text-[11px] text-faint line-through tnum">
              {t('feed.previousPrice', {
                price: formatPrice(item.previousPrice, locale),
              })}
            </span>
          ) : null}
        </span>
        {item.alertName ? (
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            {item.alertName}
          </span>
        ) : null}
      </span>

      {/* Unread accent */}
      {unread ? (
        <span
          aria-hidden
          className="mt-1 size-[6px] shrink-0 rounded-full bg-signal animate-pulse-dot"
        />
      ) : null}
    </>
  );

  const rowClass = `relative flex items-start gap-3 border-b border-border px-4 py-3 transition-colors ${
    unread ? 'bg-signal-dim/40' : ''
  } hover:bg-accent`;

  if (item.link) {
    return (
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className={`${rowClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
        onClick={() => onOpen(item)}
      >
        {body}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={`${rowClass} w-full text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`}
      onClick={() => onOpen(item)}
    >
      {body}
    </button>
  );
}

export function NotificationBell() {
  const { t } = useI18n();
  // Both hooks mount unconditionally; the demo one is a no-op wrapper in
  // live mode and vice versa (useNotifications goes dormant in demo builds).
  const liveFeed = useNotifications();
  const demoFeed = useDemoNotifications();
  const feed = isDemo() ? demoFeed : liveFeed;

  const badge =
    feed.unreadCount > 9 ? '9+' : feed.unreadCount > 0 ? String(feed.unreadCount) : null;

  const handleOpen = (item: NotificationItem) => {
    if (!item.readAt) void feed.markRead(item.id);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t('nav.feed')}
          title={t('nav.feed')}
          className="relative flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-accent hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Bell className="size-4" aria-hidden />
          {badge ? (
            <span
              aria-hidden
              className="absolute end-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-drop px-0.5 font-mono text-[9px] font-bold leading-none text-[#0B0E0C] tnum"
            >
              {badge}
            </span>
          ) : null}
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto border-border bg-bg p-0 sm:max-w-[400px]"
      >
        <SheetHeader className="gap-1 border-b border-border px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="micro text-muted">{t('feed.title')}</SheetTitle>
            {feed.unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void feed.markAllRead()}
                className="micro rounded-md border border-border px-2 py-1 text-faint transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {t('feed.markAllRead')}
              </button>
            ) : null}
          </div>
          <SheetDescription className="sr-only">{t('feed.title')}</SheetDescription>
        </SheetHeader>

        {/* Feed body */}
        <div className="flex-1">
          {feed.error ? (
            <p className="px-4 py-6 text-center font-mono text-[12px] text-danger">
              {t('common.error')}
            </p>
          ) : feed.loading ? (
            <div className="flex flex-col gap-3 px-4 py-6" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="size-11 animate-pulse rounded-md bg-raised" />
                  <span className="flex flex-1 flex-col gap-2">
                    <span className="h-3 w-1/2 animate-pulse rounded bg-raised" />
                    <span className="h-3 w-2/3 animate-pulse rounded bg-raised" />
                  </span>
                </div>
              ))}
            </div>
          ) : feed.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <span
                aria-hidden
                className="size-2 rounded-full bg-signal animate-pulse-dot"
              />
              <p className="micro text-faint">{t('feed.listening')}</p>
              <p className="max-w-[260px] text-[12px] leading-relaxed text-muted">
                {t('feed.empty')}
              </p>
            </div>
          ) : (
            feed.items.map((item) => (
              <FeedRow key={item.id} item={item} onOpen={handleOpen} />
            ))
          )}
        </div>

        {/* Delivery toggles */}
        <div className="mt-auto border-t border-border px-4 py-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="notify-browser" className="text-[13px] text-muted">
                {t('alerts.notifyBrowser')}
              </label>
              <Switch
                id="notify-browser"
                checked={feed.browserEnabled}
                onCheckedChange={feed.setBrowserEnabled}
              />
            </div>
            {feed.browserBlocked ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.06em] leading-relaxed text-drop">
                {t('alerts.browserBlocked')}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="notify-sound" className="text-[13px] text-muted">
                {t('alerts.notifySound')}
              </label>
              <Switch
                id="notify-sound"
                checked={feed.soundEnabled}
                onCheckedChange={feed.setSoundEnabled}
              />
            </div>
          </div>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-faint">
            {t('footer.data')}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
