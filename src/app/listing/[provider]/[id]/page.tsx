import type { Metadata } from 'next';

import { AppHeader } from '@/components/radar/app-header';
import { AppFooter } from '@/components/radar/app-footer';
import { ListingDetail } from '@/components/radar/listing-detail';
import { fetchDetailCached } from '@/lib/providers/detail-cache';
import { fetchLocalDetail } from '@/lib/local-ads';

/**
 * /listing/[provider]/[id] — dedicated offer page.
 *
 * Live-sync contract: the client re-fetches from the source on mount and
 * every 60s after. This shell adds instant first paint: it tries the detail
 * micro-cache (45s TTL, shared with the API route in the same server
 * process) with a 4s cap —
 *   - cache hit  → complete offer server-rendered, zero skeleton;
 *   - cold miss  → scrape starts here AND the client fetch dedups onto the
 *                  same in-flight promise; if the scrape beats the 4s cap
 *                  the HTML ships complete, otherwise the client path takes
 *                  over (bounded skeleton).
 * On persistent source failure the client surfaces retry/404 states.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Offer — DealRadar Georgia',
};

const SSR_FETCH_CAP_MS = 4_000;

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { provider, id } = await params;
  const sp = await searchParams;
  const rawHint = sp.url;
  const urlHint = Array.isArray(rawHint) ? rawHint[0] : rawHint;
  const rawDeal = sp.deal;
  const dealParam = (Array.isArray(rawDeal) ? rawDeal[0] : rawDeal) === 'rent' ? 'rent' : 'buy';

  const validScraped =
    ['korter', 'ss', 'myhome'].includes(provider) && /^\d{1,12}$/.test(id);
  const isLocal = provider === 'local' && /^[0-9a-z]{15,30}$/i.test(id);

  // Cache-eligible fetch (fresh=false). Never let it hold the HTML hostage:
  // race the scrape against a hard cap and fall back to the client path.
  let initialDetail = null as Awaited<
    ReturnType<typeof fetchDetailCached>
  >['payload'] | null;
  if (isLocal) {
    // Owner ads come straight from the DB — instant, no cap race.
    try {
      initialDetail = await fetchLocalDetail(id);
    } catch {
      initialDetail = null; // 404 state renders client-side
    }
  } else if (validScraped) {
    try {
      const job = fetchDetailCached(provider as 'korter' | 'ss' | 'myhome', id, {
        hint: urlHint,
        deal: dealParam,
      });
      const cap = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SSR_FETCH_CAP_MS),
      );
      const won = await Promise.race([job, cap]);
      if (won) initialDetail = won.payload;
    } catch {
      // Source down / 404 — the client fetch will render the proper state.
      initialDetail = null;
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">
        <ListingDetail
          provider={provider}
          id={id}
          initialDetail={initialDetail}
        />
      </main>
      <AppFooter />
    </div>
  );
}
