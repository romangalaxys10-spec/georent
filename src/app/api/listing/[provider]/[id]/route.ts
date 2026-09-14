/**
 * /api/listing/[provider]/[id] — LIVE offer detail, fetched from the source
 * site on every call (real-time sync contract), with price-drop tracking
 * persisted per provider:
 *   - korter → Listing table (objectId Int, shared with the scanner);
 *   - ss / myhome → RemoteListing table (id "provider:remoteId").
 *
 * GET /api/listing/ss/25954411
 * GET /api/listing/korter/897847?url=%2Fbinebis...%2F897847   (card link hint
 *      — skips the recent-cards scan fallback)
 *
 * Response: UnifiedDetail + { tracked: { minPriceUsd, priceDrops, firstSeenAt,
 * lastSeenAt, previousPriceUsd? } } — 404 when the source says gone.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchUnifiedDetail } from '@/lib/providers/index'
import type { UnifiedDetail } from '@/lib/providers/index'

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
    const urlHint = new URL(request.url).searchParams.get('url') ?? undefined

    const detail = await fetchUnifiedDetail(
      provider as 'korter' | 'ss' | 'myhome',
      id,
      urlHint,
    )
    const tracked =
      provider === 'korter' ? await trackKorter(detail) : await trackRemote(detail)

    return NextResponse.json({ ...detail, tracked })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /not found/i.test(message) ? 404 : 502
    return NextResponse.json(
      { error: status === 404 ? 'not_found' : 'upstream', message },
      { status },
    )
  }
}
