/**
 * Normalized korter.ge domain types.
 *
 * These are the shapes the rest of the app consumes — raw API/SSR payloads are
 * mapped into these in adapter.ts and never leak further.
 */

/** One normalized listing card (from the JSON API or the SSR INITIAL_STATE fallback). */
export type KorterListing = {
  /** Korter's stable listing id — dedup key, NEVER actualizeTime. */
  objectId: number
  price: number
  currency: string
  /** m², float. */
  area: number
  roomCount: number
  /** Last actualization timestamp (freshness signal). */
  actualizeTime: Date
  /** Korter district geo id, when derivable from the source item. */
  districtId?: number
  /** District name (korter `subLocalityNominative`). */
  districtName?: string
  address?: string
  buildingName?: string
  lat?: number
  lng?: number
  /** First entry of `floorNumbers[]`. */
  floor?: number
  floorCount?: number
  /** Best available image URL. */
  image?: string
  /** Absolute link (https://korter.ge/...). */
  link: string
  /** Price per m² — price/area guarded (0 when area is missing/≤0). */
  ppsm: number
  /** Number of grouped units behind this card (e.g. dev projects). */
  groupObjectCount?: number
  /** Full raw source item, stringified (persisted on Listing.raw). */
  raw: string
}

/** Supported korter sort orders (verified values + pattern-verified ones). */
export type KorterSort =
  | 'update_time_desc'
  | 'price_asc'
  | 'price_desc'
  | 'price_sqm_asc'

/** Filter set for fetchCards — maps 1:1 onto korter query params. */
export type SearchFilters = {
  /** Main city geo id (1=Tbilisi, 2=Batumi). */
  cityId: number
  /** Korter district geo ids — comma-joined into geo_object_ids. */
  districtIds?: number[]
  /** Room counts — comma-joined into room_counts (COMMA-SEPARATED, NOT brackets!). */
  roomCounts?: number[]
  minPrice?: number
  maxPrice?: number
  minArea?: number
  maxArea?: number
  sort?: KorterSort
  limit?: number
  offset?: number
}

/** Which pipeline produced the listings. */
export type KorterSource = 'api' | 'ssr'

/** Result of fetchCards. */
export type CardFetchResult = {
  listings: KorterListing[]
  source: KorterSource
}

/** District entry from the geo-objects filter tree. */
export type KorterDistrict = {
  id: number
  name: string
  /** Path-form link as returned by korter (e.g. /en/apartments-sale-tbilisi-vake-district). */
  link: string | null
}

/**
 * Health of a real-estate source in the app UI.
 * korter → 'ok'; ss.ge / myhome.ge are Cloudflare-blocked and must render
 * honestly as 'blocked' — do NOT claim support for them.
 */
export type SourceStatus = {
  id: 'korter' | 'ss' | 'myhome'
  name: string
  status: 'ok' | 'blocked' | 'error'
  /** Which pipeline served the data when status === 'ok' (korter only). */
  source?: KorterSource
  detail?: string
  checkedAt: string
}

/** Classification of a listing against its previously-persisted state. */
export type SeenKind = 'NEW' | 'PRICE_DROP' | 'BUMP' | 'SAME'
