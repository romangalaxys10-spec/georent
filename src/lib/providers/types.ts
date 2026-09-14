/**
 * Unified multi-provider domain types.
 *
 * Every provider (korter.ge, ss.ge, myhome.ge) is normalized into these
 * shapes at the adapter boundary — raw payloads never leak past this file.
 */

export type ProviderName = 'korter' | 'ss' | 'myhome'

export const PROVIDERS: { id: ProviderName; label: string; site: string }[] = [
  { id: 'korter', label: 'Korter', site: 'korter.ge' },
  { id: 'ss', label: 'SS.ge', site: 'home.ss.ge' },
  { id: 'myhome', label: 'MyHome', site: 'myhome.ge' },
]

/** One normalized listing card — the atom the whole app consumes. */
export type UnifiedListing = {
  /** Stable per-provider id — "ss:25685152" style composite for UI keys. */
  key: string
  provider: ProviderName
  /** Raw numeric id inside the provider. */
  objectId: string
  title: string
  /** Canonical USD total price (converted when the source quotes GEL). */
  priceUsd: number
  /** Native currency code + amount as quoted by the source. */
  currency: string
  priceNative: number
  /** USD per m² — scoring currency. */
  ppsmUsd: number
  area: number
  roomCount: number
  bedrooms?: number
  districtName?: string
  cityName?: string
  address?: string
  buildingName?: string
  lat?: number
  lng?: number
  floor?: number
  floorCount?: number
  /** Best thumbnail URL (blur variant used as LQIP when available). */
  image?: string
  imageBlur?: string
  photoCount: number
  /** ISO timestamp of last freshness signal from the source. */
  updatedAt: string
  /** Absolute URL on the source site. */
  sourceUrl: string
  isVip: boolean
  /** Deal score fields (filled by computeDealScores over merged batches). */
  score?: number
  basis?: 'district' | 'city' | 'none'
  /** Cross-source duplicate detection: other providers this listing appears on. */
  alsoOn?: ProviderName[]
}

/** Per-source run report returned with every unified search. */
export type ProviderRunStatus = {
  id: ProviderName
  label: string
  /** ok = live data returned; degraded = partial (e.g. filtered post-hoc); down = failed. */
  status: 'ok' | 'degraded' | 'down'
  count: number
  /** Estimated total matches at the source (when the provider reports it). */
  total?: number
  durationMs: number
  error?: string
}

export type UnifiedSearchResult = {
  listings: UnifiedListing[]
  statuses: ProviderRunStatus[]
  /** True when the response came from the short-lived micro-cache. */
  cached: boolean
  fetchedAt: string
}

/** Rich detail payload for the dedicated offer page. */
export type UnifiedDetail = {
  listing: UnifiedListing
  /** HTML description as served by the source (sanitized client-side). */
  descriptionHtml?: string
  photos: { large: string; thumb?: string; blur?: string }[]
  params: {
    condition?: string
    buildYear?: number
    balconies?: number
    ceilingHeight?: number
    bathroomCount?: number
    kitchenArea?: number
    livingArea?: number
    parking?: string
    heating?: string
    hotWater?: string
    material?: string
    yardArea?: number
    storeroomArea?: number
    loggiaArea?: number
    porchArea?: number
  }
  seller?: {
    name?: string
    type?: string
    logo?: string
    phone?: string
    isOwner?: boolean
    statementsCount?: number
  }
  views?: number
  createdAt?: string
  /** Weekly market price history around this listing (tnet sources). */
  priceHistory?: { date: string; avgPpsmUsd: number; avgTotalUsd: number; samples: number }[]
  syncedAt: string
}

/** Filters shared by every provider search (USD prices, m² areas). */
export type UnifiedFilters = {
  cityId: number
  districtNames?: string[]
  roomCounts?: number[]
  minPrice?: number
  maxPrice?: number
  minArea?: number
  maxArea?: number
  /** 1-based page for pagination-aware providers. */
  page: number
  perPage: number
}
