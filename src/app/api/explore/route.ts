/**
 * /api/explore — LIVE multi-source listing search: korter.ge + ss.ge +
 * myhome.ge in one fan-out (Promise.allSettled), merged, cross-source
 * deduped, deal-scored and sorted.
 *
 * Every request hits the source network (that is the contract — the data you
 * see is what the sites serve right now), with a 15s micro-cache keyed by the
 * full filter set (bypass with fresh=1) to keep multi-client bursts honest
 * but cheap.
 *
 * GET params:
 *   cityId (1=Tbilisi, 2=Batumi), districts (csv of korter district ids),
 *   rooms (csv), minPrice/maxPrice (USD), minArea/maxArea (m²),
 *   keyword, bedrooms (csv), minFloor/maxFloor, minPpsm/maxPpsm (USD/m²),
 *   newBuilding=1, hasBalcony=1,
 *   sources (csv: korter|ss|myhome, default all),
 *   sort (update_time_desc|price_asc|price_desc|price_sqm_asc),
 *   offset, limit (1..40), fresh=1
 *
 * Response: { listings, sources: ProviderRunStatus[], total, fetchedAt,
 *             cached, offset, limit }
 * The 502-upstream path only fires when EVERY source fails.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { fetchDistricts } from '@/lib/korter/adapter'
import { fetchLocalAds } from '@/lib/local-ads'
import { attachScores } from '@/lib/providers'
import {
  searchAllProviders,
  type ProviderName,
  type UnifiedFilters,
  type UnifiedListing,
  type UnifiedSearchResult,
} from '@/lib/providers/index'

const CACHE_TTL_MS = 15_000
const CACHE_MAX_ENTRIES = 40
const TNET_PAGE_SIZE = 24
const MAX_FETCH_PAGES = 3

const SORT_VALUES = ['update_time_desc', 'price_asc', 'price_desc', 'price_sqm_asc'] as const

const exploreQuerySchema = z.object({
  cityId: z.number().int().positive().max(50).default(1),
  districtIds: z.array(z.number().int()).optional(),
  roomCounts: z.array(z.number().int()).optional(),
  bedrooms: z.array(z.number().int()).optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  minArea: z.number().optional(),
  maxArea: z.number().optional(),
  minFloor: z.number().int().optional(),
  maxFloor: z.number().int().optional(),
  minPpsm: z.number().optional(),
  maxPpsm: z.number().optional(),
  keyword: z.string().trim().max(60).optional(),
  newBuilding: z.boolean().optional(),
  hasBalcony: z.boolean().optional(),
  sources: z.array(z.enum(['korter', 'ss', 'myhome', 'local'])).optional(),
  deal: z.enum(['buy', 'rent']).optional(),
  sort: z.enum(SORT_VALUES).default('update_time_desc'),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(40).default(20),
  fresh: z.boolean().default(false),
})

type ExploreQuery = z.infer<typeof exploreQuerySchema>

/** Cache holds the FULL merged+sorted batch per filter combo (no offset/limit). */
type CacheEntry = { value: UnifiedSearchResult; expiresAt: number }

function cache(): Map<string, CacheEntry> {
  const g = globalThis as unknown as { __exploreV2Cache?: Map<string, CacheEntry> }
  if (!g.__exploreV2Cache) g.__exploreV2Cache = new Map()
  return g.__exploreV2Cache
}

function numberParam(sp: URLSearchParams, key: string): number | undefined {
  const raw = sp.get(key)
  if (raw === null || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : Number.NaN
}

function csvIntsParam(sp: URLSearchParams, key: string): number[] | undefined {
  const raw = sp.get(key)
  if (raw === null || raw.trim() === '') return undefined
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s)
      return Number.isInteger(n) ? n : Number.NaN
    })
}

function canonicalKey(q: ExploreQuery): string {
  return JSON.stringify({
    cityId: q.cityId,
    deal: q.deal ?? 'buy',
    districts: [...(q.districtIds ?? [])].sort((a, b) => a - b),
    rooms: [...(q.roomCounts ?? [])].sort((a, b) => a - b),
    bedrooms: [...(q.bedrooms ?? [])].sort((a, b) => a - b),
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    minArea: q.minArea,
    maxArea: q.maxArea,
    minFloor: q.minFloor,
    maxFloor: q.maxFloor,
    minPpsm: q.minPpsm,
    maxPpsm: q.maxPpsm,
    keyword: q.keyword,
    newBuilding: q.newBuilding,
    hasBalcony: q.hasBalcony,
    sources: [...(q.sources ?? [])].sort(),
    sort: q.sort,
  })
}

function sortListings(listings: UnifiedListing[], sort: ExploreQuery['sort']): UnifiedListing[] {
  const out = [...listings]
  switch (sort) {
    case 'price_asc':
      out.sort((a, b) => (a.priceUsd || Infinity) - (b.priceUsd || Infinity))
      break
    case 'price_desc':
      out.sort((a, b) => b.priceUsd - a.priceUsd)
      break
    case 'price_sqm_asc':
      out.sort((a, b) => (a.ppsmUsd > 0 ? a.ppsmUsd : Infinity) - (b.ppsmUsd > 0 ? b.ppsmUsd : Infinity))
      break
    case 'update_time_desc':
      out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      break
  }
  return out
}

/** Pages needed per source so that [offset, offset+limit) is fully covered. */
function pagesFor(offset: number, limit: number): number {
  return Math.min(MAX_FETCH_PAGES, Math.max(1, Math.ceil((offset + limit) / TNET_PAGE_SIZE)))
}

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const parsed = exploreQuerySchema.safeParse({
      cityId: numberParam(sp, 'cityId') ?? 1,
      districtIds: csvIntsParam(sp, 'districts'),
      roomCounts: csvIntsParam(sp, 'rooms'),
      bedrooms: csvIntsParam(sp, 'bedrooms'),
      minPrice: numberParam(sp, 'minPrice'),
      maxPrice: numberParam(sp, 'maxPrice'),
      minArea: numberParam(sp, 'minArea'),
      maxArea: numberParam(sp, 'maxArea'),
      minFloor: numberParam(sp, 'minFloor'),
      maxFloor: numberParam(sp, 'maxFloor'),
      minPpsm: numberParam(sp, 'minPpsm'),
      maxPpsm: numberParam(sp, 'maxPpsm'),
      keyword: sp.get('keyword') ?? undefined,
      newBuilding: sp.get('newBuilding') === '1' ? true : undefined,
      hasBalcony: sp.get('hasBalcony') === '1' ? true : undefined,
      sources: sp.get('sources')
        ? sp
            .get('sources')!
            .split(',')
            .map((s) => s.trim())
            .filter((s): s is ProviderName => s === 'korter' || s === 'ss' || s === 'myhome' || s === 'local')
        : undefined,
      deal: sp.get('deal') === 'rent' ? 'rent' : sp.get('deal') === 'buy' ? 'buy' : undefined,
      sort: sp.get('sort') ?? undefined,
      offset: numberParam(sp, 'offset') ?? 0,
      limit: numberParam(sp, 'limit') ?? 20,
      fresh: sp.get('fresh') === '1',
    })
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      return NextResponse.json({ error: `invalid query params: ${msg}` }, { status: 400 })
    }
    const q = parsed.data

    // Resolve korter district ids → names so tnet sources can post-filter.
    let districtNames: string[] | undefined
    if (q.districtIds && q.districtIds.length > 0) {
      try {
        const districts = await fetchDistricts(q.cityId, q.deal ?? 'buy')
        const byId = new Map(districts.map((d) => [d.id, d.name]))
        districtNames = q.districtIds
          .map((id) => byId.get(id))
          .filter((n): n is string => typeof n === 'string')
      } catch {
        districtNames = undefined
      }
    }

    const key = canonicalKey(q)
    const now = Date.now()
    const hit = cache().get(key)
    let result: UnifiedSearchResult
    if (hit && hit.expiresAt > now && !q.fresh) {
      result = hit.value
      cache().delete(key)
      cache().set(key, hit) // refresh recency
    } else {
      if (hit) cache().delete(key)
      const filters: UnifiedFilters = {
        cityId: q.cityId,
        deal: q.deal,
        districtIds: q.districtIds,
        districtNames,
        roomCounts: q.roomCounts,
        bedrooms: q.bedrooms,
        minPrice: q.minPrice,
        maxPrice: q.maxPrice,
        minArea: q.minArea,
        maxArea: q.maxArea,
        minFloor: q.minFloor,
        maxFloor: q.maxFloor,
        minPpsm: q.minPpsm,
        maxPpsm: q.maxPpsm,
        keyword: q.keyword || undefined,
        newBuilding: q.newBuilding,
        hasBalcony: q.hasBalcony,
        page: 1,
        perPage: q.limit,
      }
      const scrapedSources = q.sources?.filter((s) => s !== 'local')
      if (scrapedSources && scrapedSources.length === 0) {
        // Local-only request: skip the scraped fan-out entirely.
        result = {
          listings: [],
          statuses: [],
          cached: false,
          fetchedAt: new Date().toISOString(),
        }
      } else {
        try {
          result = await searchAllProviders(
            filters,
            { providers: scrapedSources, maxPages: pagesFor(q.offset, q.limit) },
          )
        } catch (err) {
          // Every scraped source down — local ads (added below) still serve.
          console.error('[explore] all scraped sources failed:', err)
          result = {
            listings: [],
            statuses: [],
            cached: false,
            fetchedAt: new Date().toISOString(),
          }
        }
      }

      // Local owner ads join the same pipeline (unless explicitly excluded).
      const wantsLocal = !q.sources || q.sources.includes('local')
      if (wantsLocal) {
        try {
          const local = await fetchLocalAds({
            deal: q.deal,
            cityName: q.cityId === 1 ? 'Tbilisi' : q.cityId === 2 ? 'Batumi' : undefined,
            districtNames,
            roomCounts: q.roomCounts,
            minPrice: q.minPrice,
            maxPrice: q.maxPrice,
            minArea: q.minArea,
            maxArea: q.maxArea,
            take: 24,
          })
          result.listings.unshift(...local)
          result.statuses = [
            ...result.statuses,
            {
              id: 'local',
              label: 'Local',
              status: 'ok',
              count: local.length,
              total: local.length,
              durationMs: 0,
            },
          ]
          // Re-score over the combined batch so local owner ads carry the same
          // deal score / basis the scraped cards have (score ring + best-deal
          // sort both read these; missing score rendered as NaN).
          result.listings = attachScores(result.listings)
        } catch {
          // DB hiccup — feed still serves the scraped sources.
        }
      }

      result.listings = sortListings(result.listings, q.sort)
      const store = cache()
      while (store.size >= CACHE_MAX_ENTRIES) {
        const oldest = store.keys().next().value
        if (oldest === undefined) break
        store.delete(oldest)
      }
      store.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
    }

    const page = result.listings.slice(q.offset, q.offset + q.limit)
    return NextResponse.json({
      listings: page,
      sources: result.statuses,
      total: result.listings.length,
      fetchedAt: result.fetchedAt,
      cached: !q.fresh && hit !== undefined,
      offset: q.offset,
      limit: q.limit,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'upstream', message }, { status: 502 })
  }
}
