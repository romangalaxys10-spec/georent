/**
 * korter.ge source adapter.
 *
 * Primary pipeline: JSON API `/pyapi/apartment/cards/sale` (verified contract).
 * Fallback pipeline: SSR HTML page → `window.INITIAL_STATE` extraction
 * (JSONDecoder-style balanced-brace scan, NOT regex-to-}).
 *
 * Verified pitfalls baked in here:
 *  - room_counts is COMMA-SEPARATED ("2,3"); the bracket format is SILENTLY ignored.
 *  - sort=update_time_desc (sort=date is invalid and breaks the page).
 *  - envelope is {status:"OK", code:200, data:[...], timestamp}; errors are
 *    FastAPI-style {detail:...}.
 *  - Browser-like User-Agent + Accept: application/json required, no auth.
 */
import type {
  CardFetchResult,
  KorterDistrict,
  KorterListing,
  SearchFilters,
  SeenKind,
} from './types'

export const KORTER_BASE = 'https://korter.ge'

const API_TIMEOUT_MS = 15_000
const PRICE_EPSILON = 0.005 // 0.5% — noise band for "same price"

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const JSON_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
}

const HTML_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Raised only when BOTH pipelines fail (or a helper endpoint misbehaves). */
export class KorterError extends Error {
  constructor(message: string) {
    super(`[korter] ${message}`)
    this.name = 'KorterError'
  }
}

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

/** City geo id → SSR page slug (korter URL pattern /en/apartments-for-sale-<slug>). */
const CITY_SLUGS: Record<number, string> = {
  1: 'tbilisi',
  2: 'batumi',
}

/**
 * Build the shared filter query params. The JSON API and the SSR page accept
 * the same filter names (min_price, max_price, min_area, max_area,
 * room_counts, geo_object_ids, sort) — verified.
 */
function buildFilterParams(filters: SearchFilters, forSsr: boolean): URLSearchParams {
  const p = new URLSearchParams()
  p.set('sort_geo_object_id', String(filters.cityId))
  // geo_object_ids: comma-joined district ids, else the city itself.
  const geoIds =
    filters.districtIds && filters.districtIds.length > 0
      ? filters.districtIds.join(',')
      : String(filters.cityId)
  p.set('geo_object_ids', geoIds)
  // CRITICAL: comma-separated — brackets are silently ignored by the API.
  if (filters.roomCounts && filters.roomCounts.length > 0) {
    p.set('room_counts', filters.roomCounts.join(','))
  }
  if (filters.minPrice != null) p.set('min_price', String(filters.minPrice))
  if (filters.maxPrice != null) p.set('max_price', String(filters.maxPrice))
  if (filters.minArea != null) p.set('min_area', String(filters.minArea))
  if (filters.maxArea != null) p.set('max_area', String(filters.maxArea))
  p.set('property_category', 'flat')
  p.set('locale', 'en-US')
  const sort = filters.sort ?? 'update_time_desc'
  p.set('sort', sort)
  if (forSsr) {
    // SSR page paginates by `page`, not offset/limit.
    const limit = filters.limit ?? 20
    const page = Math.floor((filters.offset ?? 0) / limit) + 1
    p.set('page', String(page))
  } else {
    p.set('offset', String(filters.offset ?? 0))
    p.set('limit', String(filters.limit ?? 20))
  }
  return p
}

// ---------------------------------------------------------------------------
// fetchCards — API primary, SSR fallback
// ---------------------------------------------------------------------------

/**
 * Fetch listing cards. Tries the JSON API first; on any failure (network,
 * non-200, envelope status !== "OK") falls back to scraping the SSR page's
 * window.INITIAL_STATE. Throws KorterError only when both pipelines fail.
 */
export async function fetchCards(filters: SearchFilters): Promise<CardFetchResult> {
  let apiError: unknown
  try {
    const listings = await fetchCardsViaApi(filters)
    return { listings, source: 'api' }
  } catch (err) {
    apiError = err
  }
  try {
    const listings = await fetchCardsViaSsr(filters)
    return { listings, source: 'ssr' }
  } catch (ssrError) {
    const apiMsg = errorMessage(apiError)
    const ssrMsg = errorMessage(ssrError)
    throw new KorterError(`fetchCards failed — api: ${apiMsg}; ssr: ${ssrMsg}`)
  }
}

async function fetchCardsViaApi(filters: SearchFilters): Promise<KorterListing[]> {
  const qs = buildFilterParams(filters, false)
  const url = `${KORTER_BASE}/pyapi/apartment/cards/sale?${qs.toString()}`
  const res = await fetch(url, {
    headers: JSON_HEADERS,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`cards API HTTP ${res.status}`)
  const json: unknown = await res.json()
  // Envelope: {status:"OK", code:200, data:[...], timestamp}
  if (!isEnvelopeOk(json)) throw new Error(`cards API envelope status ${envelopeStatus(json)}`)
  const data = (json as { data?: unknown }).data
  const items: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown[] })?.items)
      ? ((data as { items: unknown[] }).items)
      : Array.isArray((data as { apartments?: unknown[] })?.apartments)
        ? ((data as { apartments: unknown[] }).apartments)
        : []
  return items.map(normalizeItem)
}

async function fetchCardsViaSsr(filters: SearchFilters): Promise<KorterListing[]> {
  const slug = CITY_SLUGS[filters.cityId] ?? 'tbilisi'
  const qs = buildFilterParams(filters, true)
  const url = `${KORTER_BASE}/en/apartments-for-sale-${slug}?${qs.toString()}`
  const res = await fetch(url, {
    headers: HTML_HEADERS,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`SSR page HTTP ${res.status}`)
  const html = await res.text()
  const state = extractInitialState(html)
  if (!state) throw new Error('window.INITIAL_STATE not found/unparseable')
  const apartments = (state as { apartmentListingStore?: { apartments?: unknown[] } })
    ?.apartmentListingStore?.apartments
  if (!Array.isArray(apartments)) throw new Error('apartmentListingStore.apartments missing')
  return apartments.map(normalizeItem)
}

/**
 * Extract the value of `window.INITIAL_STATE = {...}` from page HTML using a
 * JSONDecoder-style raw_decode: locate the marker, skip whitespace, find the
 * opening `{` (or `[`), then scan with balanced brackets while respecting
 * string literals and escapes. Returns the parsed value or null.
 */
export function extractInitialState(html: string): unknown {
  const MARKER = 'window.INITIAL_STATE'
  const markerAt = html.indexOf(MARKER)
  if (markerAt === -1) return null
  const eqAt = html.indexOf('=', markerAt + MARKER.length)
  if (eqAt === -1) return null
  let i = eqAt + 1
  while (i < html.length && /\s/.test(html[i])) i++
  const open = html[i]
  if (open !== '{' && open !== '[') return null
  const close = open === '{' ? '}' : ']'
  const start = i
  let depth = 0
  let inString = false
  let escaped = false
  for (; i < html.length; i++) {
    const c = html[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
    } else if (c === open) {
      depth++
    } else if (c === close) {
      depth--
      if (depth === 0) {
        const slice = html.slice(start, i + 1)
        try {
          return JSON.parse(slice)
        } catch {
          return null
        }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// fetchDistricts
// ---------------------------------------------------------------------------

/**
 * District tree for a city: GET /pyapi/apartment/filters/geo-objects/sale
 * ?property_category=flat&locale=en-US&main_geo_object_id={cityId}
 * Returns [{id, name, link}] from data.childrenGeoObjects (nominative as name).
 */
export async function fetchDistricts(cityId: number): Promise<KorterDistrict[]> {
  const url =
    `${KORTER_BASE}/pyapi/apartment/filters/geo-objects/sale` +
    `?property_category=flat&locale=en-US&main_geo_object_id=${encodeURIComponent(String(cityId))}`
  const res = await fetch(url, {
    headers: JSON_HEADERS,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  })
  if (!res.ok) throw new KorterError(`geo-objects API HTTP ${res.status}`)
  const json: unknown = await res.json()
  if (!isEnvelopeOk(json)) throw new KorterError(`geo-objects envelope status ${envelopeStatus(json)}`)
  const children = (json as { data?: { childrenGeoObjects?: unknown[] } }).data?.childrenGeoObjects
  if (!Array.isArray(children)) throw new KorterError('geo-objects payload missing childrenGeoObjects')
  return children
    .map((c) => {
      const o = c as { geoObjectId?: unknown; nominative?: unknown; link?: unknown }
      return {
        id: Number(o.geoObjectId),
        name: String(o.nominative ?? ''),
        link: typeof o.link === 'string' ? o.link : null,
      }
    })
    .filter((d) => Number.isFinite(d.id) && d.name.length > 0)
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Map a raw API/SSR item onto KorterListing.
 *  - ppsm = price / area, guarded (area <= 0 or missing → 0)
 *  - link absolutized against KORTER_BASE
 *  - actualizeTime falls back to now() when missing/unparseable
 */
export function normalizeItem(raw: unknown): KorterListing {
  const item = (raw ?? {}) as Record<string, unknown>
  const objectId = Number(item.objectId)
  if (!Number.isFinite(objectId)) throw new KorterError('item without objectId')
  const price = num(item.price) ?? 0
  const area = num(item.area) ?? 0
  const roomCount = Number.isFinite(Number(item.roomCount)) ? Number(item.roomCount) : 0
  const ppsm = area > 0 ? price / area : 0

  const rawLink = typeof item.link === 'string' ? item.link : ''
  const link = rawLink.startsWith('http')
    ? rawLink
    : rawLink
      ? `${KORTER_BASE}${rawLink.startsWith('/') ? '' : '/'}${rawLink}`
      : KORTER_BASE

  const actualize = parseDate(item.actualizeTime) ?? new Date()

  const media = item.mediaSrc as { default?: { x1?: unknown; x2?: unknown } } | undefined
  const image =
    (typeof media?.default?.x2 === 'string' && media.default.x2) ||
    (typeof media?.default?.x1 === 'string' && media.default.x1) ||
    undefined

  const building = item.building as
    | { name?: unknown; address?: unknown; position?: { lat?: unknown; lng?: unknown } }
    | undefined
  const house = item.house as { floorCount?: unknown } | undefined
  const floorNumbers = Array.isArray(item.floorNumbers) ? item.floorNumbers : []

  return {
    objectId,
    price,
    currency: typeof item.currency === 'string' ? item.currency : 'USD',
    area,
    roomCount,
    actualizeTime: actualize,
    districtName: typeof item.subLocalityNominative === 'string' ? item.subLocalityNominative : undefined,
    address: typeof item.address === 'string' ? item.address : undefined,
    buildingName: typeof building?.name === 'string' ? building.name : undefined,
    lat: num(building?.position?.lat) ?? undefined,
    lng: num(building?.position?.lng) ?? undefined,
    floor: floorNumbers.length > 0 ? (num(floorNumbers[0]) ?? undefined) : undefined,
    floorCount: num(house?.floorCount) ?? undefined,
    image: image || undefined,
    link,
    ppsm,
    groupObjectCount: num(item.groupObjectCount) ?? undefined,
    raw: JSON.stringify(item),
  }
}

// ---------------------------------------------------------------------------
// Classification (dedup + change detection)
// ---------------------------------------------------------------------------

/**
 * Classify an incoming listing against its persisted state.
 *  - NEW        — never seen before
 *  - PRICE_DROP — price dropped > 0.5% below existing.lastPrice (strongest signal)
 *  - BUMP       — actualizeTime advanced while price is ~same (≤0.5%)
 *  - SAME       — nothing meaningful changed
 * PRICE_DROP wins over BUMP when both apply.
 */
export function classifySeen(
  existing: {
    lastPrice: number
    actualizeTime: Date | string
  } | null,
  incoming: KorterListing,
): SeenKind {
  if (!existing) return 'NEW'
  const last = existing.lastPrice
  if (!Number.isFinite(last) || last <= 0) return 'NEW'
  const delta = incoming.price - last
  const relDelta = delta / last
  if (relDelta < 0 && Math.abs(relDelta) > PRICE_EPSILON) return 'PRICE_DROP'
  const priceSame = Math.abs(relDelta) <= PRICE_EPSILON
  const prevTime = new Date(existing.actualizeTime).getTime()
  const bumped =
    Number.isFinite(prevTime) && incoming.actualizeTime.getTime() > prevTime
  if (priceSame && bumped) return 'BUMP'
  return 'SAME'
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isEnvelopeOk(json: unknown): boolean {
  return (
    !!json &&
    typeof json === 'object' &&
    (json as { status?: unknown }).status === 'OK'
  )
}

function envelopeStatus(json: unknown): string {
  const s = (json as { status?: unknown } | null)?.status
  const detail = (json as { detail?: unknown } | null)?.detail
  return `${String(s ?? 'none')}${detail !== undefined ? ` (${String(detail)})` : ''}`
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || v.length === 0) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
