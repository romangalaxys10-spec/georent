/**
 * /api/listing/[provider]/[id] — LIVE offer detail with price-drop tracking
 * persisted per provider:
 *   - korter → Listing table (objectId Int, shared with the scanner);
 *   - ss / myhome → RemoteListing table (id "provider:remoteId").
 *
 * GET /api/listing/ss/25954411
 * GET /api/listing/korter/897847?url=%2Fbinebis...%2F897847   (card link hint
 *      — skips the recent-cards scan fallback)
 * GET ...?fresh=1   — bypass the 45s micro-cache (manual "Sync now")
 *
 * Real-time sync contract is preserved: TTL 45s < the client's 60s auto-sync,
 * so scheduled refreshes still reach the source; manual sync is always fresh.
 * On upstream failure the last good copy is served (stale) — never a 502
 * when we have data.
 *
 * Response: UnifiedDetail + { tracked, cached, stale } — 404 when the source
 * says gone.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchDetailCached, patchDetailCache } from '@/lib/providers/detail-cache'
import type { UnifiedDetail } from '@/lib/providers/detail-cache'

const VALID_PROVIDERS = new Set(['korter', 'ss', 'myhome'])

/** Upsert korter tracking into the shared Listing table. */
async function trackKorter(detail: UnifiedDetail) {
  const l = detail.listing
  const objectId = Number(l.objectId)
  if (!Number.isInteger(objectId)) return undefined
  const existing = await db.listing.findUnique({ where: { objectId } })
  if (!existing) {
    await db.listing.create({
      data: {
        objectId,
        price: l.priceUsd,
        currency: l.currency,
        area: l.area,
        roomCount: l.roomCount,
        actualizeTime: new Date(l.updatedAt),
        lastPrice: l.priceUsd,
        minPriceSeen: l.priceUsd,
        priceDrops: 0,
        cityId: 1,
        districtName: l.districtName,
        address: l.address,
        buildingName: l.buildingName,
        lat: l.lat,
        lng: l.lng,
        floor: l.floor,
        floorCount: l.floorCount,
        image: l.image,
        link: l.sourceUrl,
        ppsm: l.ppsmUsd,
        raw: JSON.stringify({ provider: 'korter', syncedAt: detail.syncedAt }).slice(0, 8000),
      },
    })
    return { previousPriceUsd: undefined as number | undefined }
  }
  const dropped = l.priceUsd < existing.lastPrice - 0.5
  await db.listing.update({
    where: { objectId },
    data: {
      lastSeenAt: new Date(),
      lastPrice: l.priceUsd,
      minPriceSeen: Math.min(existing.minPriceSeen, l.priceUsd),
      priceDrops: existing.priceDrops + (dropped ? 1 : 0),
      price: l.priceUsd,
    },
  })
  return {
    previousPriceUsd: dropped ? existing.lastPrice : undefined,
    minPriceUsd: Math.min(existing.minPriceSeen, l.priceUsd),
    priceDrops: existing.priceDrops + (dropped ? 1 : 0),
    firstSeenAt: existing.firstSeenAt.toISOString(),
  }
}

/** Upsert ss/myhome tracking into RemoteListing. */
async function trackRemote(detail: UnifiedDetail) {
  const l = detail.listing
  const id = l.key
  const existing = await db.remoteListing.findUnique({ where: { id } })
  if (!existing) {
    await db.remoteListing.create({
      data: {
        id,
        provider: l.provider,
        remoteId: l.objectId,
        title: l.title.slice(0, 240),
        priceUsd: l.priceUsd,
        lastPriceUsd: l.priceUsd,
        minPriceUsd: l.priceUsd,
        priceDrops: 0,
        area: l.area,
        roomCount: l.roomCount,
        ppsmUsd: l.ppsmUsd,
        districtName: l.districtName,
        cityName: l.cityName,
        sourceUrl: l.sourceUrl,
        image: l.image,
        raw: JSON.stringify({ syncedAt: detail.syncedAt }).slice(0, 8000),
      },
    })
    return { previousPriceUsd: undefined as number | undefined }
  }
  const dropped = l.priceUsd < existing.lastPriceUsd - 0.5
  await db.remoteListing.update({
    where: { id },
    data: {
      lastSeenAt: new Date(),
      lastPriceUsd: l.priceUsd,
      minPriceUsd: Math.min(existing.minPriceUsd, l.priceUsd),
      priceDrops: existing.priceDrops + (dropped ? 1 : 0),
      priceUsd: l.priceUsd,
    },
  })
  return {
    previousPriceUsd: dropped ? existing.lastPriceUsd : undefined,
    minPriceUsd: Math.min(existing.minPriceUsd, l.priceUsd),
    priceDrops: existing.priceDrops + (dropped ? 1 : 0),
    firstSeenAt: existing.firstSeenAt.toISOString(),
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string; id: string }> },
) {
  try {
    const { provider, id } = await context.params
    if (!VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: 'unknown provider' }, { status: 400 })
    }
    if (!/^[0-9]{1,12}$/.test(id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const params = new URL(request.url).searchParams
    const urlHint = params.get('url') ?? undefined
    const fresh = params.get('fresh') === '1'

    const { payload, fromCache, stale } = await fetchDetailCached(
      provider as 'korter' | 'ss' | 'myhome',
      id,
      { hint: urlHint, fresh },
    )

    // Persist price-drop tracking only when the source was actually hit;
    // cache hits replay the tracked data stored with the payload.
    let tracked = payload.tracked
    if (!fromCache) {
      tracked =
        provider === 'korter'
          ? await trackKorter(payload)
          : await trackRemote(payload)
      patchDetailCache(provider, id, { tracked })
    }

    return NextResponse.json(
      { ...payload, tracked, cached: fromCache, stale },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /not found/i.test(message) ? 404 : 504
    return NextResponse.json(
      { error: status === 404 ? 'not_found' : 'upstream', message },
      { status },
    )
  }
}
