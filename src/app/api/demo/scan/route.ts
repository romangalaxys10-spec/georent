/**
 * POST /api/demo/scan — stateless scan cycle for the serverless demo.
 *
 * The browser owns the baseline (objectId → last price, from localStorage)
 * and sends it with its alerts; this route does exactly one scanner cycle:
 *
 *   fetch the 3 newest korter pages per city → classify every listing
 *   against the posted baseline (NEW / PRICE_DROP / SAME) → match active
 *   alerts → return observations (new baseline) + matched notifications.
 *
 * Nothing is persisted server-side; no Prisma, no socket.io. District ids
 * are resolved from subLocality names via the districts endpoint (cached
 * per lambda instance, same as the scanner).
 *
 * Body: { alerts: DemoAlert[], seen: Record<objectId, price> }
 * Resp: { scannedAt, observations: {objectId, price}[], notifications: [...] }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fetchCards, fetchDistricts } from '@/lib/korter/adapter'
import type { KorterListing } from '@/lib/korter/types'
import {
  classifyAgainstSeen,
  matchDemoAlert,
  type DemoAlert,
  type Observation,
  type SeenEntry,
} from '@/lib/demo/match'

export const maxDuration = 30

const PAGES_PER_CITY = 3
const PAGE_LIMIT = 20

const demoAlertSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cityId: z.number().int().positive(),
  minPrice: z.number().nullable().optional(),
  maxPrice: z.number().nullable().optional(),
  minArea: z.number().nullable().optional(),
  maxArea: z.number().nullable().optional(),
  districtIds: z.array(z.number().int()),
  roomCounts: z.array(z.number().int()),
  active: z.boolean(),
})

const bodySchema = z.object({
  alerts: z.array(demoAlertSchema).max(50),
  seen: z.record(z.string(), z.unknown()),
})

// District-name → id map per city, cached per lambda instance.
const districtTrees = new Map<number, Map<string, number>>()

async function resolveDistrictId(cityId: number, listing: KorterListing): Promise<number | null> {
  if (typeof listing.districtId === 'number' && Number.isFinite(listing.districtId)) {
    return listing.districtId
  }
  const name = listing.districtName?.trim().toLowerCase()
  if (!name) return null
  let tree = districtTrees.get(cityId)
  if (!tree) {
    try {
      const districts = await fetchDistricts(cityId)
      tree = new Map(districts.map((d) => [d.name.trim().toLowerCase(), d.id]))
      districtTrees.set(cityId, tree)
    } catch {
      return null
    }
  }
  return tree.get(name) ?? null
}

/** Fetch + merge the newest pages for one city, deduped by objectId. */
async function fetchCityBatch(cityId: number): Promise<KorterListing[]> {
  const merged = new Map<number, KorterListing>()
  for (let page = 0; page < PAGES_PER_CITY; page++) {
    try {
      const { listings } = await fetchCards({
        cityId,
        sort: 'update_time_desc',
        limit: PAGE_LIMIT,
        offset: page * PAGE_LIMIT,
      })
      for (const l of listings) merged.set(l.objectId, l)
    } catch {
      // A failed page degrades the cycle's coverage; fail only when empty.
    }
  }
  return [...merged.values()]
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    }
    const alerts: DemoAlert[] = parsed.data.alerts
      .filter((a) => a.active)
      .map((a) => ({
        ...a,
        minPrice: a.minPrice ?? null,
        maxPrice: a.maxPrice ?? null,
        minArea: a.minArea ?? null,
        maxArea: a.maxArea ?? null,
      }))
    const seen = parsed.data.seen

    /** The old price for one objectId, when the baseline entry is well-formed. */
    const seenPrice = (objectId: number): number | undefined => {
      const entry: unknown = seen[String(objectId)]
      if (entry && typeof entry === 'object' && 'p' in entry) {
        const p = (entry as { p?: unknown }).p
        if (typeof p === 'number') return p
      }
      return undefined
    }
    const seenEntry = (objectId: number): Pick<SeenEntry, 'p'> | undefined => {
      const p = seenPrice(objectId)
      return p === undefined ? undefined : { p }
    }

    const cityIds = [...new Set(alerts.map((a) => a.cityId))]
    if (cityIds.length === 0) cityIds.push(1) // keep the baseline warm (Tbilisi)

    const observations: Observation[] = []
    const notifications: {
      id: string
      alertId: string
      alertName: string
      objectId: number
      kind: 'NEW' | 'PRICE_DROP'
      price: number
      previousPrice: number | null
      title: string
      createdAt: string
      link: string | null
      image: string | null
      districtName: string | null
      address: string | null
    }[] = []

    let fetched = 0
    for (const cityId of cityIds) {
      const listings = await fetchCityBatch(cityId)
      fetched += listings.length

      for (const listing of listings) {
        const kind = classifyAgainstSeen(seenEntry(listing.objectId), listing.price)
        let districtId: number | null = null
        try {
          districtId = await resolveDistrictId(cityId, listing)
        } catch {
          districtId = null
        }
        observations.push({
          objectId: listing.objectId,
          p: listing.price,
          d: districtId,
          r: listing.roomCount,
          a: listing.area,
          c: cityId,
        })
        if (kind === 'SAME') continue

        for (const alert of alerts) {
          if (!matchDemoAlert(alert, {
            cityId,
            price: listing.price,
            area: listing.area,
            roomCount: listing.roomCount,
            districtId,
          })) continue
          notifications.push({
            id: `${listing.objectId}:${kind}`,
            alertId: alert.id,
            alertName: alert.name,
            objectId: listing.objectId,
            kind,
            price: listing.price,
            previousPrice: seenPrice(listing.objectId) ?? null,
            title:
              listing.address ||
              listing.buildingName ||
              listing.districtName ||
              `Listing #${listing.objectId}`,
            createdAt: new Date().toISOString(),
            link: listing.link,
            image: listing.image ?? null,
            districtName: listing.districtName ?? null,
            address: listing.address ?? null,
          })
        }
      }
    }

    if (fetched === 0) {
      return NextResponse.json({ error: 'upstream' }, { status: 502 })
    }

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      observations,
      notifications,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    )
  }
}
