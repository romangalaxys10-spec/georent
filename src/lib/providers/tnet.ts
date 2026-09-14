/**
 * tnet.ge statements platform adapter — serves BOTH ss.ge and myhome.ge.
 *
 * Both sites run on the same TNET Classifieds backend. The listing JSON API
 * lives at api-statements.tnet.ge and is keyed by the X-Website-Key header
 * ('ss' or 'myhome'). Verified live on 2026-09-14:
 *
 *   GET /v1/statements?currency_id=1&deal_types=1&real_estate_types=1
 *        &cities=1&price_from=&price_to=&area_from=&area_to=&room_types=2,3
 *        &q=<keyword>&building_status=new_building&has_balcony=1&page=N
 *   headers: X-Website-Key: ss|myhome, locale: en
 *   → {result:true, data:{data:[24 items], map_settings, seo}}
 *
 *   GET /v1/statements/count?<same filters> → {data:{total,per_page,last_page}}
 *   GET /v1/statements/{id}                 → {data:{statement:{…112 fields}}}
 *   GET /v1/statements/price-history/{id}   → weekly market averages
 *
 * Filters that the API does not accept (bedrooms, floor range, ppsm range)
 * are applied honestly as post-filters here and flagged in the run status.
 */
import type {
  ProviderName,
  ProviderRunStatus,
  UnifiedDetail,
  UnifiedFilters,
  UnifiedListing,
} from './types'

const TNET_BASE = 'https://api-statements.tnet.ge/v1'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TIMEOUT_MS = 9_000

/**
 * GEL → USD fallback when a listing omits its USD denominator.
 * Also used to convert USD filter bounds into GEL query params: the tnet
 * statements API filters prices in the currency set by currency_id, and
 * currency_id=1 (GEL) is required for stable USD denominators in responses —
 * so price_from/price_to must arrive pre-multiplied (verified live: a raw
 * 50000 price_from yields ~$19k listings without this conversion).
 */
const GEL_PER_USD = 2.65

/** Korter main-city geo id → tnet city id (verified via api-locations.tnet.ge/v2/cities). */
const TNET_CITY_IDS: Record<number, number> = { 1: 1, 2: 15 }

type TnetPrice = { price_total?: number; price_square?: number }

/** Raw card as returned by /v1/statements (only the fields we consume). */
type TnetCard = {
  id: number
  uuid?: string
  deal_type_id?: number
  real_estate_type_id?: number
  price?: Record<string, TnetPrice>
  lat?: number | null
  lng?: number | null
  images?: { large?: string; thumb?: string; blur?: string; is_main?: boolean }[]
  address?: string | null
  area?: number | null
  bedroom?: string | number | null
  room?: string | number | null
  dynamic_title?: string | null
  dynamic_slug?: string | null
  href_lang?: string | null
  last_updated?: string | null
  floor?: number | null
  total_floors?: number | null
  district_name?: string | null
  city_name?: string | null
  urban_name?: string | null
  is_vip?: boolean
  is_vip_plus?: boolean
  is_super_vip?: boolean
  comment?: string | null
  is_owner?: boolean
  user_statements_count?: number
  user_type?: { type?: string; logo?: string } | null
  seo?: { url?: string } | null
}

/** Detail-only statement shape (subset). */
type TnetStatement = TnetCard & {
  condition?: string | null
  condition_id?: number | null
  build_year?: number | null
  balconies?: number | null
  height?: number | null
  bathroom_type_id?: number | null
  kitchen_area?: number | null
  living_room_area?: number | null
  parking_type_id?: number | null
  heating_type_id?: number | null
  hot_water_type_id?: number | null
  material_type_id?: number | null
  yard_area?: number | null
  storeroom_area?: number | null
  loggia_area?: number | null
  porch_area?: number | null
  created_at?: string | null
  views?: number | null
  owner_name?: string | null
  user_phone_number?: string | null
  metro_station_id?: number | null
  project_id?: number | null
  youtube_link?: string | null
  '3d_url'?: string | null
  parameters?: unknown
}

export class TnetError extends Error {
  constructor(
    message: string,
    readonly websiteKey: string,
  ) {
    super(message)
    this.name = 'TnetError'
  }
}

function headers(websiteKey: string): HeadersInit {
  return {
    Accept: 'application/json',
    'X-Website-Key': websiteKey,
    locale: 'en',
    'User-Agent': UA,
  }
}

/** "2026-09-14 15:26:55" (Georgia local, UTC+4) → ISO string. */
function georgiaTimeToIso(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString()
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}+04:00`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/** Pick the best USD price tuple, falling back to GEL conversion. */
function extractUsd(price: Record<string, TnetPrice> | undefined): {
  total: number
  ppsm: number
  native: number
  currency: string
} {
  const usd = price?.['2']
  const gel = price?.['1']
  if (usd && typeof usd.price_total === 'number' && usd.price_total > 0) {
    return {
      total: usd.price_total,
      ppsm: usd.price_square ?? (usd.price_total > 0 ? usd.price_total : 0),
      native: usd.price_total,
      currency: 'USD',
    }
  }
  if (gel && typeof gel.price_total === 'number' && gel.price_total > 0) {
    const total = Math.round(gel.price_total / GEL_PER_USD)
    const ppsm = typeof gel.price_square === 'number' && gel.price_square > 0
      ? Math.round(gel.price_square / GEL_PER_USD)
      : 0
    return { total, ppsm, native: gel.price_total, currency: 'GEL' }
  }
  return { total: 0, ppsm: 0, native: 0, currency: 'USD' }
}

/** Source-site listing URL. */
export function tnetSourceUrl(
  websiteKey: 'ss' | 'myhome',
  card: Pick<TnetCard, 'dynamic_slug' | 'id' | 'href_lang' | 'seo'>,
): string {
  const slug = card.dynamic_slug ?? 'listing'
  if (typeof card.href_lang === 'string' && card.href_lang.startsWith('http')) {
    return card.href_lang
  }
  const host = websiteKey === 'ss' ? 'https://home.ss.ge' : 'https://www.myhome.ge'
  return `${host}/en/real-estate/${slug}-${card.id}/`
}

/** Map a raw tnet card onto the unified shape. */
export function normalizeTnetCard(
  card: TnetCard,
  websiteKey: 'ss' | 'myhome',
): UnifiedListing {
  const usd = extractUsd(card.price)
  const area = typeof card.area === 'number' && card.area > 0 ? card.area : 0
  const ppsmUsd =
    usd.ppsm > 0 ? usd.ppsm : area > 0 && usd.total > 0 ? Math.round(usd.total / area) : 0
  const main = card.images?.find((i) => i.is_main) ?? card.images?.[0]
  const rooms = Number(card.room ?? 0) || 0
  const bedrooms = Number(card.bedroom ?? 0) || undefined
  const title = card.dynamic_title?.trim() || `${rooms} room apartment`
  const place =
    card.district_name?.trim() ||
    card.urban_name?.trim() ||
    card.address?.trim() ||
    undefined

  return {
    key: `${websiteKey}:${card.id}`,
    provider: websiteKey,
    objectId: String(card.id),
    title,
    priceUsd: usd.total,
    currency: usd.currency,
    priceNative: usd.native,
    ppsmUsd,
    area,
    roomCount: rooms,
    bedrooms: bedrooms && bedrooms > 0 ? bedrooms : undefined,
    districtName: card.district_name?.trim() || undefined,
    cityName: card.city_name?.trim() || undefined,
    address: card.address?.trim() || undefined,
    buildingName: card.urban_name?.trim() || undefined,
    lat: typeof card.lat === 'number' ? card.lat : undefined,
    lng: typeof card.lng === 'number' ? card.lng : undefined,
    floor: typeof card.floor === 'number' && card.floor > 0 ? card.floor : undefined,
    floorCount:
      typeof card.total_floors === 'number' && card.total_floors > 0
        ? card.total_floors
        : undefined,
    image: main?.large ?? main?.thumb,
    imageBlur: main?.blur,
    photoCount: card.images?.length ?? 0,
    updatedAt: georgiaTimeToIso(card.last_updated),
    sourceUrl: tnetSourceUrl(websiteKey, card),
    isVip: Boolean(card.is_vip || card.is_vip_plus || card.is_super_vip),
  }
}

/** District-name post-filter: token overlap between filter name and source name. */
function districtMatches(filterName: string, sourceName: string | undefined): boolean {
  if (!sourceName) return false
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[-_/]/g, ' ')
      .replace(/district|ubani|region/g, '')
      .split(/\s+/)
      .filter(Boolean)
  const f = norm(filterName)
  const s = norm(sourceName)
  return f.some((tok) => tok.length >= 4 && s.some((st) => st.startsWith(tok) || tok.startsWith(st)))
}

export type TnetPage = {
  listings: UnifiedListing[]
  /** Rough total available at the source for these filters. */
  total?: number
  /** Filters applied as post-filters instead of API params (see module doc). */
  postFiltered: boolean
}

/** Extended filter fields tnet consumes beyond the shared UnifiedFilters. */
export type TnetExtras = {
  keyword?: string
  newBuilding?: boolean
  hasBalcony?: boolean
}

function buildQuery(
  websiteKey: 'ss' | 'myhome',
  f: UnifiedFilters,
  extras: TnetExtras,
): URLSearchParams {
  const sp = new URLSearchParams()
  sp.set('currency_id', '1')
  sp.set('deal_types', '1')
  sp.set('real_estate_types', '1')
  sp.set('cities', String(TNET_CITY_IDS[f.cityId] ?? f.cityId))
  // API filters run in GEL (currency_id=1) — convert USD bounds.
  if (f.minPrice !== undefined) {
    sp.set('price_from', String(Math.round(f.minPrice * GEL_PER_USD)))
  }
  if (f.maxPrice !== undefined) {
    sp.set('price_to', String(Math.round(f.maxPrice * GEL_PER_USD)))
  }
  if (f.minArea !== undefined) sp.set('area_from', String(f.minArea))
  if (f.maxArea !== undefined) sp.set('area_to', String(f.maxArea))
  if (f.roomCounts && f.roomCounts.length > 0) sp.set('room_types', f.roomCounts.join(','))
  if (extras.keyword) sp.set('q', extras.keyword)
  if (extras.newBuilding) sp.set('building_status', 'new_building')
  if (extras.hasBalcony) sp.set('has_balcony', '1')
  sp.set('page', String(Math.max(1, f.page)))
  return sp
}

/** Fetch one page of listings. Post-filters (district names) applied here. */
export async function fetchTnetPage(
  websiteKey: 'ss' | 'myhome',
  f: UnifiedFilters,
  extras: TnetExtras = {},
): Promise<TnetPage> {
  const url = `${TNET_BASE}/statements?${buildQuery(websiteKey, f, extras).toString()}`
  const res = await fetch(url, { headers: headers(websiteKey), signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new TnetError(`HTTP ${res.status}`, websiteKey)
  const json = (await res.json()) as { result?: boolean; data?: { data?: TnetCard[] } }
  const cards = json?.data?.data
  if (!Array.isArray(cards)) throw new TnetError('unexpected envelope', websiteKey)

  let listings = cards.map((c) => normalizeTnetCard(c, websiteKey))

  // Post-filters the API cannot express.
  const wantsDistrict =
    f.districtNames && f.districtNames.length > 0
      ? (l: UnifiedListing) =>
          f.districtNames!.some((n) => districtMatches(n, l.districtName ?? l.buildingName))
      : null
  const wantsBedrooms =
    f.bedrooms && f.bedrooms.length > 0
      ? (l: UnifiedListing) => l.bedrooms !== undefined && f.bedrooms!.includes(l.bedrooms)
      : null
  const wantsFloor =
    f.minFloor !== undefined || f.maxFloor !== undefined
      ? (l: UnifiedListing) => {
          if (typeof l.floor !== 'number') return false
          if (f.minFloor !== undefined && l.floor < f.minFloor) return false
          if (f.maxFloor !== undefined && l.floor > f.maxFloor) return false
          return true
        }
      : null
  const wantsPpsmMin = f.minPpsm !== undefined ? (l: UnifiedListing) => l.ppsmUsd >= f.minPpsm! : null
  const wantsPpsmMax = f.maxPpsm !== undefined ? (l: UnifiedListing) => l.ppsmUsd <= f.maxPpsm! : null

  const post = [wantsDistrict, wantsBedrooms, wantsFloor, wantsPpsmMin, wantsPpsmMax].filter(
    (fn): fn is (l: UnifiedListing) => boolean => fn !== null,
  )
  let postFiltered = false
  for (const fn of post) {
    listings = listings.filter(fn)
    postFiltered = true
  }
  return { listings, postFiltered }
}

/** Estimated total matches at the source (best-effort, non-fatal). */
export async function fetchTnetTotal(
  websiteKey: 'ss' | 'myhome',
  f: UnifiedFilters,
  extras: TnetExtras = {},
): Promise<number | undefined> {
  try {
    const url = `${TNET_BASE}/statements/count?${buildQuery(websiteKey, f, extras).toString()}`
    const res = await fetch(url, {
      headers: headers(websiteKey),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return undefined
    const json = (await res.json()) as { data?: { total?: number } }
    return typeof json?.data?.total === 'number' ? json.data.total : undefined
  } catch {
    return undefined
  }
}

/** Full statement detail for the offer page. */
export async function fetchTnetDetail(
  websiteKey: 'ss' | 'myhome',
  id: string,
): Promise<UnifiedDetail> {
  const url = `${TNET_BASE}/statements/${encodeURIComponent(id)}`
  const res = await fetch(url, { headers: headers(websiteKey), signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 404) throw new TnetError('listing not found', websiteKey)
  if (!res.ok) throw new TnetError(`HTTP ${res.status}`, websiteKey)
  const json = (await res.json()) as { data?: { statement?: TnetStatement } }
  const st = json?.data?.statement
  if (!st) throw new TnetError('missing statement payload', websiteKey)

  const listing = normalizeTnetCard(st, websiteKey)
  const photos = (st.images ?? [])
    .map((i) => ({ large: i.large ?? '', thumb: i.thumb, blur: i.blur }))
    .filter((p) => p.large.length > 0)

  const detail: UnifiedDetail = {
    listing,
    descriptionHtml: st.comment ?? undefined,
    photos,
    params: {
      condition: st.condition ?? undefined,
      buildYear: st.build_year ?? undefined,
      balconies: st.balconies ?? undefined,
      ceilingHeight: st.height ?? undefined,
      kitchenArea: st.kitchen_area ?? undefined,
      livingArea: st.living_room_area ?? undefined,
      yardArea: st.yard_area ?? undefined,
      storeroomArea: st.storeroom_area ?? undefined,
      loggiaArea: st.loggia_area ?? undefined,
      porchArea: st.porch_area ?? undefined,
    },
    seller: {
      name: st.owner_name ?? undefined,
      type: st.user_type?.type,
      logo: st.user_type?.logo,
      phone: st.user_phone_number ?? undefined,
      isOwner: st.is_owner,
      statementsCount: st.user_statements_count,
    },
    views: st.views ?? undefined,
    createdAt: georgiaTimeToIso(st.created_at),
    syncedAt: new Date().toISOString(),
  }
  return detail
}

/** Weekly market price history (area averages) around a listing. */
export async function fetchTnetPriceHistory(
  websiteKey: 'ss' | 'myhome',
  id: string,
): Promise<UnifiedDetail['priceHistory']> {
  const to = new Date()
  const from = new Date(to.getTime() - 365 * 86_400_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const url =
    `${TNET_BASE}/statements/price-history/${encodeURIComponent(id)}` +
    `?dateFrom=${fmt(from)}&dateTo=${fmt(to)}`
  try {
    const res = await fetch(url, { headers: headers(websiteKey), signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return undefined
    const json = (await res.json()) as {
      data?: { date?: string; avg_square_price_usd?: number; avg_total_price_usd?: number; total?: number }[]
    }
    const rows = Array.isArray(json?.data) ? json.data : []
    return rows
      .filter((r) => typeof r.avg_square_price_usd === 'number')
      .map((r) => ({
        date: (r.date ?? '').slice(0, 10),
        avgPpsmUsd: r.avg_square_price_usd as number,
        avgTotalUsd: r.avg_total_price_usd ?? 0,
        samples: r.total ?? 0,
      }))
  } catch {
    return undefined
  }
}

/** True when the provider name maps to the tnet gateway. */
export function isTnet(provider: ProviderName): provider is 'ss' | 'myhome' {
  return provider === 'ss' || provider === 'myhome'
}
