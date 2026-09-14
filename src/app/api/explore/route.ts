/**
 * /api/explore — live korter.ge listing search with deal scores.
 *
 * GET query params:
 *   cityId (int, default 1), districts (csv of ids), rooms (csv of ints),
 *   minPrice/maxPrice/minArea/maxArea (numbers), sort
 *   (update_time_desc|price_asc|price_desc|price_sqm_asc, default
 *   update_time_desc), offset (default 0), limit (default 20, max 40).
 *
 * Pipeline: params → SearchFilters → adapter.fetchCards → score.computeDealScores.
 * Successful responses are memoized in-memory for 30s (max 50 entries, oldest
 * evicted) keyed by a canonical param string.
 * Upstream failure → 502 {error:'upstream', message}.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fetchCards } from '@/lib/korter/adapter'
import { computeDealScores, type DealScored } from '@/lib/korter/score'
import type { CardFetchResult, KorterSort, SearchFilters } from '@/lib/korter/types'

const CACHE_TTL_MS = 30_000
const CACHE_MAX_ENTRIES = 50

const SORT_VALUES = [
  'update_time_desc',
  'price_asc',
  'price_desc',
  'price_sqm_asc',
] as const

const exploreQuerySchema = z.object({
  cityId: z.number().int().positive().default(1),
  districtIds: z.array(z.number().int()).optional(),
  roomCounts: z.array(z.number().int()).optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  minArea: z.number().optional(),
  maxArea: z.number().optional(),
  sort: z.enum(SORT_VALUES).default('update_time_desc'),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(40).default(20),
})

type ExploreQuery = z.infer<typeof exploreQuerySchema>
type ScoredResult = { listings: DealScored[]; source: CardFetchResult['source'] }
type CacheEntry = { value: ScoredResult; expiresAt: number }

/** Cache singleton persisted across dev-server HMR reloads. */
function cache(): Map<string, CacheEntry> {
  const g = globalThis as unknown as { __exploreCache?: Map<string, CacheEntry> }
  if (!g.__exploreCache) g.__exploreCache = new Map()
  return g.__exploreCache
}

/** Raw query param → number, or NaN when absent-but-malformed. '' counts as absent. */
function numberParam(sp: URLSearchParams, key: string): number | undefined {
  const raw = sp.get(key)
  if (raw === null || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : Number.NaN
}

/** Raw csv param → int array; undefined when absent/empty; NaN entries stay for zod to reject. */
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
    districts: [...(q.districtIds ?? [])].sort((a, b) => a - b),
    rooms: [...(q.roomCounts ?? [])].sort((a, b) => a - b),
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    minArea: q.minArea,
    maxArea: q.maxArea,
    sort: q.sort,
    offset: q.offset,
    limit: q.limit,
  })
}

function toSearchFilters(q: ExploreQuery): SearchFilters {
  const filters: SearchFilters = {
    cityId: q.cityId,
    sort: q.sort as KorterSort,
    offset: q.offset,
    limit: q.limit,
  }
  if (q.districtIds && q.districtIds.length > 0) filters.districtIds = q.districtIds
  if (q.roomCounts && q.roomCounts.length > 0) filters.roomCounts = q.roomCounts
  if (q.minPrice !== undefined) filters.minPrice = q.minPrice
  if (q.maxPrice !== undefined) filters.maxPrice = q.maxPrice
  if (q.minArea !== undefined) filters.minArea = q.minArea
  if (q.maxArea !== undefined) filters.maxArea = q.maxArea
  return filters
}

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const parsed = exploreQuerySchema.safeParse({
      cityId: numberParam(sp, 'cityId'),
      districtIds: csvIntsParam(sp, 'districts'),
      roomCounts: csvIntsParam(sp, 'rooms'),
      minPrice: numberParam(sp, 'minPrice'),
      maxPrice: numberParam(sp, 'maxPrice'),
      minArea: numberParam(sp, 'minArea'),
      maxArea: numberParam(sp, 'maxArea'),
      sort: sp.get('sort') ?? undefined,
      offset: numberParam(sp, 'offset'),
      limit: numberParam(sp, 'limit'),
    })
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      return NextResponse.json({ error: `invalid query params: ${msg}` }, { status: 400 })
    }
    const query = parsed.data
    const key = canonicalKey(query)

    const now = Date.now()
    const hit = cache().get(key)
    let result: ScoredResult
    if (hit && hit.expiresAt > now) {
      result = hit.value
      // Refresh recency so the Map evicts the true oldest entry first.
      cache().delete(key)
      cache().set(key, hit)
    } else {
      if (hit) cache().delete(key)
      const fetched = await fetchCards(toSearchFilters(query))
      result = { listings: computeDealScores(fetched.listings), source: fetched.source }
      const store = cache()
      while (store.size >= CACHE_MAX_ENTRIES) {
        const oldest = store.keys().next().value
        if (oldest === undefined) break
        store.delete(oldest)
      }
      store.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
    }

    return NextResponse.json({
      listings: result.listings,
      source: result.source,
      offset: query.offset,
      limit: query.limit,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'upstream', message }, { status: 502 })
  }
}
