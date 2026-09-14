/**
 * Multi-provider orchestration — one search fan-out across korter.ge, ss.ge
 * and myhome.ge.
 *
 * searchAllProviders:
 *   - fires all enabled providers in parallel (Promise.allSettled, hard
 *     per-provider timeout) so one slow/blocked source never stalls the feed;
 *   - normalizes every result into UnifiedListing;
 *   - detects cross-source duplicates (same apartment advertised on two
 *     platforms) and merges them under the freshest card via `alsoOn`;
 *   - computes deal scores over the merged batch (city + district shrinkage);
 *   - returns per-provider run statuses (latency, counts, errors) so the UI
 *     can prove the data is live.
 *
 * fetchUnifiedDetail dispatches the dedicated offer-page fetch per provider.
 */
import { fetchCards } from '@/lib/korter/adapter'
import type { SearchFilters as KorterFilters } from '@/lib/korter/types'
import { computeDealScores } from '@/lib/korter/score'
import type { KorterListing } from '@/lib/korter/types'

import {
  fetchTnetDetail,
  fetchTnetPage,
  fetchTnetPriceHistory,
  fetchTnetTotal,
  isTnet,
} from './tnet'
import { KorterDetailError, fetchKorterDetail } from './korter-detail'
import type {
  ProviderName,
  ProviderRunStatus,
  UnifiedDetail,
  UnifiedFilters,
  UnifiedListing,
  UnifiedSearchResult,
} from './types'

export { PROVIDERS } from './types'
export type {
  ProviderName,
  ProviderRunStatus,
  UnifiedDetail,
  UnifiedFilters,
  UnifiedListing,
  UnifiedSearchResult,
} from './types'

const PROVIDER_LABELS: Record<ProviderName, string> = {
  korter: 'Korter',
  ss: 'SS.ge',
  myhome: 'MyHome',
}

/** KorterListing → UnifiedListing (prices are already USD at korter). */
function unifyKorter(l: KorterListing): UnifiedListing {
  return {
    key: `korter:${l.objectId}`,
    provider: 'korter',
    objectId: String(l.objectId),
    title: `${l.roomCount} BR${l.buildingName ? ` · ${l.buildingName}` : ''}`,
    priceUsd: l.price,
    currency: l.currency || 'USD',
    priceNative: l.price,
    ppsmUsd: l.ppsm,
    area: l.area,
    roomCount: l.roomCount,
    districtName: l.districtName,
    cityName: undefined,
    address: l.address,
    buildingName: l.buildingName,
    lat: l.lat,
    lng: l.lng,
    floor: l.floor,
    floorCount: l.floorCount,
    image: l.image,
    photoCount: 0,
    updatedAt: (l.actualizeTime instanceof Date
      ? l.actualizeTime
      : new Date(l.actualizeTime)
    ).toISOString(),
    sourceUrl: l.link,
    isVip: false,
  }
}

/** ---------- cross-source duplicate detection ---------- */

function normDistrict(name: string | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .split(/[-_/,\s]+/)
    .filter((t) => t.length >= 4 && !['district', 'ubani', 'region'].includes(t))[0] ?? ''
}

/** Two cards describe the same apartment when district + rooms + area + price line up. */
function sameApartment(a: UnifiedListing, b: UnifiedListing): boolean {
  if (a.provider === b.provider) return false
  if (a.roomCount > 0 && b.roomCount > 0 && a.roomCount !== b.roomCount) return false
  const da = normDistrict(a.districtName ?? a.address)
  const db = normDistrict(b.districtName ?? b.address)
  if (da && db && da !== db) return false
  const areaOk =
    a.area > 0 &&
    b.area > 0 &&
    Math.abs(a.area - b.area) <= Math.max(1.5, 0.03 * Math.max(a.area, b.area))
  const priceOk =
    a.priceUsd > 0 &&
    b.priceUsd > 0 &&
    Math.abs(a.priceUsd - b.priceUsd) <= 0.04 * Math.max(a.priceUsd, b.priceUsd)
  return areaOk && priceOk
}

/** Merge duplicate groups onto the freshest card, recording `alsoOn`. */
function mergeCrossSource(listings: UnifiedListing[]): UnifiedListing[] {
  const groups: UnifiedListing[][] = []
  for (const l of listings) {
    let matched = false
    for (const g of groups) {
      if (sameApartment(l, g[0])) {
        g.push(l)
        matched = true
        break
      }
    }
    if (!matched) groups.push([l])
  }
  const out: UnifiedListing[] = []
  for (const g of groups) {
    if (g.length === 1) {
      out.push(g[0])
      continue
    }
    // Primary = the card with a photo, then freshest updatedAt.
    const sorted = [...g].sort((x, y) => {
      const ph = Number(y.photoCount > 0) - Number(x.photoCount > 0)
      if (ph !== 0) return ph
      return new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime()
    })
    const [primary, ...rest] = sorted
    const others = rest.map((r) => r.provider)
    const cheaper = rest.reduce(
      (min, r) => (r.priceUsd > 0 && (min === 0 || r.priceUsd < min) ? r.priceUsd : min),
      0,
    )
    out.push({
      ...primary,
      alsoOn: primary.alsoOn ?? others,
      priceUsd: cheaper > 0 && cheaper < primary.priceUsd ? cheaper : primary.priceUsd,
    })
  }
  return out
}

/** ---------- search fan-out ---------- */

export type SearchAllOptions = {
  /** Which providers to query (default: all three). */
  providers?: ProviderName[]
  /** Hard cap on pages fetched per provider (tnet pages are 24, korter 20). */
  maxPages?: number
}

function toKorterFilters(f: UnifiedFilters, page: number): KorterFilters {
  return {
    cityId: f.cityId,
    districtIds: f.districtIds,
    roomCounts: f.roomCounts,
    minPrice: f.minPrice,
    maxPrice: f.maxPrice,
    minArea: f.minArea,
    maxArea: f.maxArea,
    offset: (page - 1) * f.perPage,
    limit: f.perPage,
  }
}

/** One provider's page fetch wrapped into the unified shape. */
async function runProvider(
  provider: ProviderName,
  f: UnifiedFilters,
  maxPages: number,
): Promise<{ listings: UnifiedListing[]; total?: number; postFiltered: boolean }> {
  const pages = Array.from({ length: Math.max(1, maxPages) }, (_, i) => i + 1)
  const results = await Promise.all(
    pages.map(async (page) => {
      if (provider === 'korter') {
        const { listings } = await fetchCards(toKorterFilters(f, page))
        return listings.map(unifyKorter)
      }
      if (isTnet(provider)) {
        const page_ = await fetchTnetPage(provider, f)
        return page_.listings
      }
      return [] as UnifiedListing[]
    }),
  )
  const listings = results.flat()
  let postFiltered = false
  let total: number | undefined
  if (isTnet(provider)) {
    total = await fetchTnetTotal(provider, f)
    // fetchTnetPage applies post-filters internally per page; detect via a
    // probe of the filter fields it consumes.
    postFiltered =
      (f.districtNames?.length ?? 0) > 0 ||
      (f.bedrooms?.length ?? 0) > 0 ||
      f.minFloor !== undefined ||
      f.maxFloor !== undefined ||
      f.minPpsm !== undefined ||
      f.maxPpsm !== undefined
  } else {
    // Korter cards API has no bedroom/keyword params — floor + ppsm post-filter.
    let filtered = listings
    if (f.minFloor !== undefined) {
      filtered = filtered.filter((l) => typeof l.floor === 'number' && l.floor >= f.minFloor!)
    }
    if (f.maxFloor !== undefined) {
      filtered = filtered.filter((l) => typeof l.floor === 'number' && l.floor <= f.maxFloor!)
    }
    if (f.minPpsm !== undefined) filtered = filtered.filter((l) => l.ppsmUsd >= f.minPpsm!)
    if (f.maxPpsm !== undefined) filtered = filtered.filter((l) => l.ppsmUsd <= f.maxPpsm!)
    postFiltered = filtered.length !== listings.length
    return { listings: filtered, total: undefined, postFiltered }
  }
  return { listings, total, postFiltered }
}

/**
 * Live multi-provider search. Never throws for a single dead provider —
 * failures surface in `statuses` as `down` while the other sources still
 * deliver. Throws only when EVERY provider fails.
 */
export async function searchAllProviders(
  filters: UnifiedFilters,
  options: SearchAllOptions = {},
): Promise<UnifiedSearchResult> {
  const enabled: ProviderName[] = options.providers ?? ['korter', 'ss', 'myhome']
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 1, 4))

  const started = new Map<ProviderName, number>()
  for (const p of enabled) started.set(p, Date.now())

  const settled = await Promise.allSettled(
    enabled.map((p) => runProvider(p, filters, maxPages)),
  )

  const statuses: ProviderRunStatus[] = []
  const all: UnifiedListing[] = []

  settled.forEach((res, i) => {
    const provider = enabled[i]
    const durationMs = Date.now() - (started.get(provider) ?? Date.now())
    const label = PROVIDER_LABELS[provider]
    if (res.status === 'fulfilled') {
      const { listings, total, postFiltered } = res.value
      all.push(...listings)
      statuses.push({
        id: provider,
        label,
        status: listings.length === 0 ? 'degraded' : postFiltered ? 'degraded' : 'ok',
        count: listings.length,
        total,
        durationMs,
        ...(postFiltered ? { error: 'extended filters applied as post-filters' } : {}),
        ...(listings.length === 0 ? { error: 'no results' } : {}),
      })
    } else {
      statuses.push({
        id: provider,
        label,
        status: 'down',
        count: 0,
        durationMs,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      })
    }
  })

  if (all.length === 0 && statuses.every((s) => s.status === 'down')) {
    throw new Error(
      `all sources failed: ${statuses.map((s) => `${s.id}: ${s.error}`).join('; ')}`,
    )
  }

  const merged = mergeCrossSource(all)

  // Deal scores over the merged batch (percentile of ppsm, district shrinkage).
  const scored = computeDealScores(
    merged.map((l) => ({ districtName: l.districtName ?? null, ppsm: l.ppsmUsd })),
  )
  const listings = merged.map((l, i) => ({
    ...l,
    score: scored[i]?.score ?? 0,
    basis: scored[i]?.basis ?? 'none',
  }))

  return {
    listings,
    statuses: enabled.map((p) => statuses.find((s) => s.id === p)!),
    cached: false,
    fetchedAt: new Date().toISOString(),
  }
}

/** ---------- detail dispatch ---------- */

/** Find a korter card by objectId across the first pages of the cards API. */
async function findKorterCard(objectId: string): Promise<UnifiedListing | null> {
  for (const page of [1, 2, 3]) {
    try {
      const { listings } = await fetchCards({
        cityId: 1,
        offset: (page - 1) * 20,
        limit: 20,
      })
      const hit = listings.find((l) => String(l.objectId) === objectId)
      if (hit) return unifyKorter(hit)
    } catch {
      return null
    }
  }
  return null
}

/**
 * Live detail fetch for the offer page. Always hits the source network —
 * freshness is the contract. `sourceUrlHint` (korter card link) lets the
 * korter path skip the card-scan fallback.
 */
export async function fetchUnifiedDetail(
  provider: ProviderName,
  objectId: string,
  sourceUrlHint?: string,
): Promise<UnifiedDetail> {
  if (isTnet(provider)) {
    const detail = await fetchTnetDetail(provider, objectId)
    const history = await fetchTnetPriceHistory(provider, objectId)
    return { ...detail, priceHistory: history }
  }
  // Korter: need the listing link → hint, else scan recent cards.
  const base: UnifiedListing = {
    key: `korter:${objectId}`,
    provider: 'korter',
    objectId,
    title: '',
    priceUsd: 0,
    currency: 'USD',
    priceNative: 0,
    ppsmUsd: 0,
    area: 0,
    roomCount: 0,
    photoCount: 0,
    updatedAt: new Date().toISOString(),
    sourceUrl: sourceUrlHint ?? '',
    isVip: false,
  }
  let hint = sourceUrlHint
  if (!hint) {
    const found = await findKorterCard(objectId)
    if (!found) throw new KorterDetailError('listing not found in recent cards', 404)
    Object.assign(base, found)
    hint = found.sourceUrl
  }
  base.sourceUrl = hint
  return fetchKorterDetail(base)
}
