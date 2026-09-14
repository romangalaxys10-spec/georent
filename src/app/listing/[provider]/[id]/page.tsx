import type { Metadata } from 'next';

import { AppHeader } from '@/components/radar/app-header';
import { AppFooter } from '@/components/radar/app-footer';
import { ListingDetail } from '@/components/radar/listing-detail';

/**
 * /listing/[provider]/[id] — dedicated offer page.
 * The client component performs the LIVE source fetch itself (real-time sync
 * contract) — this server shell only wires params + chrome.
 */
export const metadata: Metadata = {
  title: 'Offer — DealRadar Georgia',
};

export default async function ListingPage({
  params,
}: {
  params: Promise<{ provider: string; id: string }>;
}) {
  const { provider, id } = await params;
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">
        <ListingDetail provider={provider} id={id} />
      </main>
      <AppFooter />
    </div>
  );
}
