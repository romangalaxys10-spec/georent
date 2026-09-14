/**
 * Korter listing-detail provider.
 *
 * Korter exposes no JSON detail endpoint — the SPA hydrates from SSR HTML in
 * `window.INITIAL_STATE → layoutLandingStore`. The SSR payload only becomes
 * complete (description, seller, images) when the request carries korter's
 * session cookies, so this module keeps a process-level cookie jar: a warm-up
 * request to the homepage seeds it once, then every detail fetch reuses the
 * jar and retries once after re-warming if the payload came back thin.
 *
 * Detail URL format (verified live): https://korter.ge/<link> — the /en/
 * prefix 404s.
 */
import { KORTER_BASE, extractInitialState } from '@/lib/korter/adapter'
import type { UnifiedDetail, UnifiedListing } from './types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TIMEOUT_MS = 12_000

type CookieJar = { cookie: string; seededAt: number }

/** Cookie jar singleton that survives dev-server HMR. */
function jar(): CookieJar {
  const g = globalThis as unknown as { __korterJar?: CookieJar }
  if (!g.__korterJar) g.__korterJar = { cookie: '', seededAt: 0 }
  return g.__korterJar
}

async function warmUp(): Promise<void> {
  const res = await fetch(`${KORTER_BASE}/`, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  const merged = new Map<string, string>()
  for (const line of jar().cookie.split('; ')) {
    const [k, ...v] = line.split('=')
    if (k && v.length > 0) merged.set(k.trim(), v.join('='))
  }
  for (const line of setCookies) {
    const [pair] = line.split(';')
    const [k, ...v] = pair.split('=')
    if (k && v.length > 0) merged.set(k.trim(), v.join('='))
  }
  jar().cookie = Array.from(merged.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  jar().seededAt = Date.now()
}

/** KorterDetailError carries the HTTP status when known. */
export class KorterDetailError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'KorterDetailError'
  }
}

type KorterLayout = {
  price?: number
  area?: number
  currency?: string
  roomCount?: number
  bedroomCount?: number | null
  bathroomCount?: number | null
  floorNumber?: number | null
  totalFloors?: number | null
  description?: string | null
  address?: string | null
  createTime?: string | null
  publishTime?: string | null
  actualizeTime?: string | null
  builtYear?: number | null
  hasBalcony?: boolean
  hasTerrace?: boolean
  ceilingHeight?: number | null
  kitchenArea?: number | null
  livingArea?: number | null
  images?: { mediaSrc?: { default?: { x1?: string; x2?: string } } }[] | null
  objectNumber?: number | string | null
}

type KorterSeller = {
  title?: string | null
  typeName?: string | null
  avatar?: string | null
  phoneNumber?: string | null
  isOwner?: boolean
  totalObjects?: number | null
}

type KorterLandingStore = {
  layout?: KorterLayout | null
  seller?: KorterSeller | null
  building?: { name?: string | null; buildYear?: number | null } | null
}

function parseInitial(html: string): KorterLandingStore {
  const state = extractInitialState(html) as
    | { layoutLandingStore?: KorterLandingStore }
    | null
  if (!state || typeof state !== 'object') {
    throw new KorterDetailError('INITIAL_STATE missing')
  }
  const store = (state as { layoutLandingStore?: KorterLandingStore }).layoutLandingStore
  if (!store?.layout) throw new KorterDetailError('layoutLandingStore.layout missing')
  return store
}

function fetchOpts(cookie: string): RequestInit {
  return {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }
}

/**
 * Fetch + parse one korter listing detail. `base` is the normalized listing
 * card from the cards API (supplies id/link); detail fields are merged onto
 * it. Descriptions shorter than 40 chars count as "thin" → one re-warm retry.
 */
export async function fetchKorterDetail(base: UnifiedListing): Promise<UnifiedDetail> {
  const path = base.sourceUrl.replace(/^https?:\/\/[^/]+/, '')
  const doFetch = async () => {
    const res = await fetch(`${KORTER_BASE}${path}`, fetchOpts(jar().cookie))
    if (res.status === 404) throw new KorterDetailError('listing not found', 404)
    if (!res.ok) throw new KorterDetailError(`HTTP ${res.status}`, res.status)
    return parseInitial(await res.text())
  }

  let store: KorterLandingStore
  try {
    store = await doFetch()
    if ((store.layout?.description ?? '').length < 40 && Date.now() - jar().seededAt > 60_000) {
      await warmUp()
      store = await doFetch()
    }
  } catch (err) {
    if (err instanceof KorterDetailError && err.status === 404) throw err
    // Cold jar → warm up and retry once.
    await warmUp()
    store = await doFetch()
  }

  const layout = store.layout ?? {}
  const seller = store.seller ?? {}
  const price = typeof layout.price === 'number' ? layout.price : base.priceUsd
  const area = typeof layout.area === 'number' && layout.area > 0 ? layout.area : base.area
  const photos = (layout.images ?? [])
    .map((img) => ({
      large: img.mediaSrc?.default?.x1 ?? '',
      thumb: img.mediaSrc?.default?.x1 ?? undefined,
    }))
    .filter((p) => p.large.length > 0)

  const detail: UnifiedDetail = {
    listing: {
      ...base,
      priceUsd: price,
      ppsmUsd: area > 0 && price > 0 ? Math.round(price / area) : base.ppsmUsd,
      area,
      bedrooms:
        typeof layout.bedroomCount === 'number' && layout.bedroomCount > 0
          ? layout.bedroomCount
          : base.bedrooms,
      floor: typeof layout.floorNumber === 'number' && layout.floorNumber > 0
        ? layout.floorNumber
        : base.floor,
      floorCount: typeof layout.totalFloors === 'number' && layout.totalFloors > 0
        ? layout.totalFloors
        : base.floorCount,
      address: layout.address ?? base.address,
      photoCount: Math.max(photos.length, base.photoCount),
    },
    descriptionHtml: layout.description ?? undefined,
    photos: photos.length > 0 ? photos : base.image ? [{ large: base.image }] : [],
    params: {
      buildYear: layout.builtYear ?? store.building?.buildYear ?? undefined,
      balconies: layout.hasBalcony ? 1 : undefined,
      ceilingHeight: layout.ceilingHeight ?? undefined,
      bathroomCount: layout.bathroomCount ?? undefined,
      kitchenArea: layout.kitchenArea ?? undefined,
      livingArea: layout.livingArea ?? undefined,
    },
    seller: {
      name: seller.title ?? undefined,
      type: seller.typeName ?? undefined,
      logo: seller.avatar ?? undefined,
      phone: seller.phoneNumber ?? undefined,
      isOwner: seller.isOwner,
      statementsCount: seller.totalObjects ?? undefined,
    },
    createdAt: layout.createTime ?? layout.publishTime ?? undefined,
    syncedAt: new Date().toISOString(),
  }
  return detail
}
