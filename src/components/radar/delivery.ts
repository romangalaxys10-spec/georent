'use client';

/**
 * delivery — notification side-effects shared by the live stack (socket
 * pushes in use-notifications) and the demo runtime (client-side scans):
 * synthesized chime, browser Notification, and the app toast.
 */
import { toast } from '@/hooks/use-toast';

export type DeliverableMatch = {
  kind: 'NEW' | 'PRICE_DROP' | 'BUMP';
  title: string;
  price: number;
  previousPrice: number | null;
  alertName: string | null;
};

/** Short two-tone "signal" chime — synthesized, no asset, auto-closed. */
export function playChime(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.42);
    });
    window.setTimeout(() => void ctx.close().catch(() => {}), 1500);
  } catch {
    // Audio unavailable (autoplay policy, missing API) — stay silent.
  }
}

/** Fire a browser notification, tolerating platforms where it throws. */
export function fireBrowserNotification(item: DeliverableMatch): void {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const body = [
      item.alertName,
      item.previousPrice && item.previousPrice > item.price
        ? `$${item.previousPrice.toLocaleString('en-US')} → $${item.price.toLocaleString('en-US')}`
        : `$${item.price.toLocaleString('en-US')}`,
    ]
      .filter(Boolean)
      .join(' · ');
    new Notification(item.title, { body });
  } catch {
    // Notification constructor can throw (e.g. Android without SW) — ignore.
  }
}

/** App toast for a batch of fresh matches (first item headlines it). */
export function announceMatches(
  fresh: DeliverableMatch[],
  labels: { new: string; drop: string; bumped: string },
): void {
  const first = fresh[0];
  if (!first) return;
  toast({
    title:
      first.kind === 'PRICE_DROP'
        ? labels.drop
        : first.kind === 'BUMP'
          ? labels.bumped
          : labels.new,
    description:
      fresh.length > 1
        ? `${first.title} · +${fresh.length - 1} more`
        : `${first.title} · $${first.price.toLocaleString('en-US')}`,
  });
}

export type BrowserPermission = 'granted' | 'denied' | 'unsupported';

/** Ask for browser-notification permission; never throws. */
export function requestBrowserPermission(): Promise<BrowserPermission> {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  return Notification.requestPermission()
    .then((permission) => (permission === 'granted' ? 'granted' : 'denied'))
    .catch(() => 'denied');
}
