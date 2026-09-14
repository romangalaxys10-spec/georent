/**
 * Scanner mini-service — real-time korter.ge poller with socket.io push.
 *
 * Independent bun project (deps resolve from the parent node_modules).
 * HTTP server on PORT 3030 with socket.io attached (path '/', sanctioned
 * config from examples/websocket/server.ts) + a tiny REST router on the
 * SAME http server:
 *
 *   GET  /health → { ok, lastScanAt, scansCount, listingsTracked,
 *                    activeAlerts, consecutiveErrors }
 *   POST /scan   → { started: true } | { started: false, reason: 'in_progress' }
 *
 * Socket events:
 *   scan_status  — after every completed scan cycle
 *   new_matches  — when new NotificationRecords were created this cycle
 *
 * Poll cycle (every 90s; 180s after 3 consecutive failures):
 *   load active alerts → distinct cityIds (fallback city 1 so the Explore
 *   feed & stats stay warm) → per city fetch 3 pages × 20 cards
 *   (sort=update_time_desc, dedupe by objectId) → classifySeen vs persisted
 *   Listing → upsert → for NEW/PRICE_DROP match active alerts → persist
 *   NotificationRecord (deduped on alertId+objectId+kind) → recompute
 *   DistrictStat percentiles for that city → emit.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Server } from 'socket.io'
import { db } from '../../src/lib/db'
import { classifySeen, fetchCards, fetchDistricts } from '../../src/lib/korter/adapter'
import type { KorterListing, SeenKind } from '../../src/lib/korter/types'

// Belt-and-braces: the root .env holds an absolute DATABASE_URL and the prisma
// client embeds its own env paths — this only guards odd cwd situations.
process.env.DATABASE_URL ??= 'file:/home/z/my-project/db/custom.db'

const PORT = 3030
const SCAN_INTERVAL_MS = 90_000
const BACKOFF_INTERVAL_MS = 180_000
const ERROR_THRESHOLD = 3
const PAGES_PER_CITY = 3
const PAGE_LIMIT = 20
const STAT_WINDOW_DAYS = 30
const DISTRICT_TREE_RETRY_MS = 10 * 60_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal structural shape of a Prisma Alert row (satisfied by db.alert rows). */
export type AlertLike = {
  id: string
  name: string
  cityId: number
  minPrice: number | null
  maxPrice: number | null
  minArea: number | null
  maxArea: number | null
  districtIds: string // JSON string array
  roomCounts: string // JSON string array
}

/** Minimal listing shape matchAlert needs. */
export type MatchListing = {
  cityId: number
  price: number
  area: number
  roomCount: number
  districtId: number | null
}

type PendingMatch = {
  id: string
  alertId: string
  alertName: string
  objectId: number
  kind: SeenKind
  price: number
  previousPrice: number | null
  title: string
  createdAt: string
  link: string
  image: string | null
}

type ScannerState = {
  lastScanAt: Date | null
  scansCount: number
  consecutiveErrors: number
  scanning: boolean
  intervalMs: number
}

type ScannerGlobal = typeof globalThis & {
  __scannerBooted?: boolean
  __scannerServer?: ReturnType<typeof createServer>
  __scannerIo?: InstanceType<typeof Server>
  __scannerTimer?: ReturnType<typeof setInterval>
  __scannerBootTimer?: ReturnType<typeof setTimeout>
  __scannerState?: ScannerState
}

const g = globalThis as ScannerGlobal

// Shared via globalThis so bun --hot reloads keep a single coherent state
// (old closures and new closures mutate the same object).
const state: ScannerState = g.__scannerState ?? {
  lastScanAt: null,
  scansCount: 0,
  consecutiveErrors: 0,
  scanning: false,
  intervalMs: SCAN_INTERVAL_MS,
}
g.__scannerState = state

let io: InstanceType<typeof Server> | null = null
let httpServer: ReturnType<typeof createServer> | null = null

// ---------------------------------------------------------------------------
// Alert matching — pure, defensively wrapped (a corrupt alert row must not
// kill the scan cycle).
// ---------------------------------------------------------------------------

function parseIdArray(json: string): number[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  } catch {
    return []
  }
}

export function matchAlert(alert: AlertLike, listing: MatchListing): boolean {
  try {
    // City must always match (this also covers the "any district of the
    // alert's city" rule when districtIds is empty/unparseable).
    if (alert.cityId !== listing.cityId) return false
    if (alert.minPrice != null && Number.isFinite(alert.minPrice) && listing.price < alert.minPrice) return false
    if (alert.maxPrice != null && Number.isFinite(alert.maxPrice) && listing.price > alert.maxPrice) return false
    const rooms = parseIdArray(alert.roomCounts)
    if (rooms.length > 0 && !rooms.includes(listing.roomCount)) return false
    if (alert.minArea != null && Number.isFinite(alert.minArea) && listing.area < alert.minArea) return false
    if (alert.maxArea != null && Number.isFinite(alert.maxArea) && listing.area > alert.maxArea) return false
    const districts = parseIdArray(alert.districtIds)
    if (districts.length === 0) return true
    return listing.districtId != null && districts.includes(listing.districtId)
  } catch (err) {
    console.error(`[scanner] matchAlert failed for alert ${alert?.id ?? '?'} — treating as no-match:`, err)
    return false
  }
}

// ---------------------------------------------------------------------------
// District id resolution — normalizeItem does not set KorterListing.districtId,
// so derive it from districtName (subLocalityNominative) via the verified
// districts endpoint; cached per city, failures retried at most every 10 min.
// ---------------------------------------------------------------------------

const districtTrees = new Map<number, Map<string, number>>()
const districtTreeFailures = new Map<number, number>()

async function getDistrictTree(cityId: number): Promise<Map<string, number>> {
  const cached = districtTrees.get(cityId)
  if (cached) return cached
  const lastFail = districtTreeFailures.get(cityId) ?? 0
  const fresh = new Map<string, number>()
  if (Date.now() - lastFail < DISTRICT_TREE_RETRY_MS) return fresh
  try {
    for (const d of await fetchDistricts(cityId)) {
      fresh.set(d.name.trim().toLowerCase(), d.id)
    }
    if (fresh.size > 0) districtTrees.set(cityId, fresh)
  } catch (err) {
    districtTreeFailures.set(cityId, Date.now())
    console.error(`[scanner] fetchDistricts(${cityId}) failed:`, errorMessage(err))
  }
  return fresh
}

async function resolveDistrictId(cityId: number, listing: KorterListing): Promise<number | null> {
  if (typeof listing.districtId === 'number' && Number.isFinite(listing.districtId)) return listing.districtId
  const name = listing.districtName?.trim().toLowerCase()
  if (!name) return null
  const tree = await getDistrictTree(cityId)
  return tree.get(name) ?? null
}

// ---------------------------------------------------------------------------
// Prisma row builders
// ---------------------------------------------------------------------------

function createData(l: KorterListing, cityId: number, districtId: number | null) {
  const now = new Date()
  return {
    objectId: l.objectId,
    price: l.price,
    currency: l.currency,
    area: l.area,
    roomCount: l.roomCount,
    actualizeTime: l.actualizeTime,
    firstSeenAt: now,
    lastSeenAt: now,
    lastPrice: l.price,
    minPriceSeen: l.price,
    priceDrops: 0,
    cityId,
    districtId,
    districtName: l.districtName ?? null,
    address: l.address ?? null,
    buildingName: l.buildingName ?? null,
    lat: l.lat ?? null,
    lng: l.lng ?? null,
    floor: l.floor ?? null,
    floorCount: l.floorCount ?? null,
    image: l.image ?? null,
    link: l.link,
    ppsm: l.ppsm,
    isSold: false,
    raw: l.raw,
  }
}

function updateData(
  l: KorterListing,
  kind: SeenKind,
  districtId: number | null,
  existing: { minPriceSeen: number },
) {
  return {
    lastSeenAt: new Date(),
    actualizeTime: l.actualizeTime,
    price: l.price,
    ppsm: l.ppsm,
    lastPrice: l.price,
    minPriceSeen: Math.min(existing.minPriceSeen, l.price),
    priceDrops: kind === 'PRICE_DROP' ? { increment: 1 } : undefined,
    districtId,
    districtName: l.districtName ?? null,
    address: l.address ?? null,
    buildingName: l.buildingName ?? null,
    lat: l.lat ?? null,
    lng: l.lng ?? null,
    floor: l.floor ?? null,
    floorCount: l.floorCount ?? null,
    image: l.image ?? null,
    raw: l.raw,
  }
}

// ---------------------------------------------------------------------------
// Fetch + scan cycle
// ---------------------------------------------------------------------------

/** Fetch PAGES_PER_CITY pages for a city, merge and dedupe by objectId. */
async function fetchCityBatch(cityId: number): Promise<KorterListing[]> {
  const merged = new Map<number, KorterListing>()
  for (let page = 0; page < PAGES_PER_CITY; page++) {
    const offset = page * PAGE_LIMIT
    try {
      const { listings, source } = await fetchCards({
        cityId,
        sort: 'update_time_desc',
        limit: PAGE_LIMIT,
        offset,
      })
      for (const l of listings) merged.set(l.objectId, l)
      console.log(`[scanner] city=${cityId} page=${page + 1}/${PAGES_PER_CITY} got=${listings.length} via=${source}`)
    } catch (err) {
      console.error(`[scanner] city=${cityId} page=${page + 1}/${PAGES_PER_CITY} fetch failed:`, errorMessage(err))
    }
  }
  return [...merged.values()]
}

/**
 * Percentile of an ascending-sorted sample with linear interpolation
 * (p10/p25/p50 of the raw ppsm column per brief).
 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  if (sortedAsc.length === 1) return sortedAsc[0]
  const idx = (p / 100) * (sortedAsc.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
}

/**
 * Recompute DistrictStat rows for one city from the DB (cityId, not sold,
 * actualizeTime within the last 30 days). Group by districtId with
 * null → group key 0 (city-wide). Upsert keyed on id `${cityId}-${key}`
 * (SQLite treats NULLs as distinct in compound uniques — id-based upsert
 * is the only safe form for the city-wide row).
 */
async function recomputeDistrictStats(cityId: number): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STAT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const rows = await db.listing.findMany({
      where: { cityId, isSold: false, actualizeTime: { gte: cutoff } },
      select: { districtId: true, ppsm: true },
    })
    const groups = new Map<number, number[]>()
    for (const r of rows) {
      // ppsm ≤ 0 is unscorable everywhere else in the app (see score.ts) —
      // keep percentile pools consistent.
      if (!(r.ppsm > 0) || !Number.isFinite(r.ppsm)) continue
      const key = r.districtId ?? 0
      const pool = groups.get(key)
      if (pool) pool.push(r.ppsm)
      else groups.set(key, [r.ppsm])
    }
    let written = 0
    for (const [key, pool] of groups) {
      pool.sort((a, b) => a - b)
      const id = `${cityId}-${key}`
      const data = {
        cityId,
        districtId: key === 0 ? null : key,
        sampleCount: pool.length,
        p10: percentile(pool, 10),
        p25: percentile(pool, 25),
        p50: percentile(pool, 50),
      }
      await db.districtStat.upsert({ where: { id }, update: data, create: { id, ...data } })
      written++
    }
    console.log(`[scanner] district stats city=${cityId} — groups=${written} samples=${rows.length}`)
  } catch (err) {
    console.error(`[scanner] district stats failed city=${cityId}:`, errorMessage(err))
  }
}

/**
 * One poll cycle. Sets state.scanning synchronously (so POST /scan can never
 * double-start) and throws on total failure — error accounting lives in
 * scanCycle().
 */
async function runScan(): Promise<void> {
  if (state.scanning) return
  state.scanning = true
  const startedAt = Date.now()
  let newCount = 0
  let dropCount = 0
  let fetchedTotal = 0
  const pending: PendingMatch[] = []
  try {
    // a. active alerts
    const alerts = await db.alert.findMany({ where: { active: true } })
    // b. distinct cityIds from alerts; fallback city 1 (Tbilisi) keeps the
    //    Explore feed, price history and stats warm even with zero alerts.
    const cityIds = [...new Set(alerts.map((a) => a.cityId).filter((id) => Number.isFinite(id)))]
    if (cityIds.length === 0) cityIds.push(1)
    console.log(`[scanner] scan #${state.scansCount + 1} start — alerts=${alerts.length} cities=[${cityIds.join(',')}]`)

    for (const cityId of cityIds) {
      // c. 3 pages, merged + deduped
      const listings = await fetchCityBatch(cityId)
      fetchedTotal += listings.length

      // d. upsert each listing + alert matching for NEW / PRICE_DROP
      for (const listing of listings) {
        try {
          const existing = await db.listing.findUnique({ where: { objectId: listing.objectId } })
          const kind: SeenKind = classifySeen(existing, listing)
          if (kind === 'NEW') newCount++
          if (kind === 'PRICE_DROP') dropCount++
          const districtId = await resolveDistrictId(cityId, listing)
          if (existing) {
            await db.listing.update({
              where: { objectId: listing.objectId },
              data: updateData(listing, kind, districtId, existing),
            })
          } else {
            await db.listing.create({ data: createData(listing, cityId, districtId) })
          }

          if (kind === 'NEW' || kind === 'PRICE_DROP') {
            for (const alert of alerts) {
              if (!matchAlert(alert, { cityId, price: listing.price, area: listing.area, roomCount: listing.roomCount, districtId })) continue
              const dupe = await db.notificationRecord.findFirst({
                where: { alertId: alert.id, objectId: listing.objectId, kind },
              })
              if (dupe) continue
              const previousPrice = existing?.lastPrice ?? null
              const title =
                listing.address || listing.buildingName || listing.districtName || `Listing #${listing.objectId}`
              const rec = await db.notificationRecord.create({
                data: {
                  alertId: alert.id,
                  objectId: listing.objectId,
                  kind,
                  price: listing.price,
                  previousPrice,
                  title,
                },
              })
              pending.push({
                id: rec.id,
                alertId: alert.id,
                alertName: alert.name,
                objectId: listing.objectId,
                kind,
                price: listing.price,
                previousPrice,
                title,
                createdAt: rec.createdAt.toISOString(),
                link: listing.link,
                image: listing.image ?? null,
              })
            }
          }
        } catch (err) {
          console.error(`[scanner] listing ${listing.objectId} failed:`, errorMessage(err))
        }
      }

      // e. district stats for this city
      await recomputeDistrictStats(cityId)
    }

    // Total fetch failure = failed cycle (drives the backoff policy).
    if (fetchedTotal === 0) {
      throw new Error('scan fetched 0 listings across all cities (network/API outage?)')
    }

    state.lastScanAt = new Date()
    state.scansCount++
    const trackedTotal = await db.listing.count()
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
    console.log(
      `[scanner] scan done in ${seconds}s — fetched=${fetchedTotal} new=${newCount} priceDrops=${dropCount} ` +
        `matches=${pending.length} tracked=${trackedTotal}`,
    )

    // f.
    io?.emit('scan_status', {
      lastScanAt: state.lastScanAt.toISOString(),
      newListings: newCount,
      priceDrops: dropCount,
      scansCount: state.scansCount,
      trackedTotal,
    })

    // g.
    if (pending.length > 0) {
      const unreadCount = await db.notificationRecord.count({ where: { readAt: null } })
      io?.emit('new_matches', { notifications: pending, unreadCount })
      console.log(`[scanner] emitted new_matches — notifications=${pending.length} unread=${unreadCount}`)
    }
  } finally {
    state.scanning = false
  }
}

/**
 * Error-policy wrapper: catch everything per cycle, count consecutive
 * failures, back the interval off to 180s after 3, reset on any success.
 */
async function scanCycle(): Promise<void> {
  if (state.scanning) return
  try {
    await runScan()
    if (state.consecutiveErrors > 0) console.log('[scanner] recovered — error streak reset')
    state.consecutiveErrors = 0
    if (state.intervalMs !== SCAN_INTERVAL_MS) setSchedule(SCAN_INTERVAL_MS)
  } catch (err) {
    state.consecutiveErrors++
    console.error(`[scanner] scan cycle failed (${state.consecutiveErrors} consecutive):`, errorMessage(err))
    if (state.consecutiveErrors >= ERROR_THRESHOLD && state.intervalMs !== BACKOFF_INTERVAL_MS) {
      console.warn('[scanner] 3 consecutive failures — backing off to 180s')
      setSchedule(BACKOFF_INTERVAL_MS)
    }
  }
}

function setSchedule(ms: number): void {
  state.intervalMs = ms
  if (g.__scannerTimer) clearInterval(g.__scannerTimer)
  g.__scannerTimer = setInterval(() => void scanCycle(), ms)
  console.log(`[scanner] schedule set to ${ms / 1000}s`)
}

// ---------------------------------------------------------------------------
// HTTP (health + manual scan trigger) on the same server as socket.io
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS })
  res.end(JSON.stringify(body))
}

async function healthPayload() {
  const [listingsTracked, activeAlerts] = await Promise.all([
    db.listing.count(),
    db.alert.count({ where: { active: true } }),
  ])
  return {
    ok: true,
    lastScanAt: state.lastScanAt ? state.lastScanAt.toISOString() : null,
    scansCount: state.scansCount,
    listingsTracked,
    activeAlerts,
    consecutiveErrors: state.consecutiveErrors,
  }
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { pathname } = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, await healthPayload())
      return
    }
    if (req.method === 'POST' && pathname === '/scan') {
      // runScan sets state.scanning synchronously before its first await,
      // so check + trigger below is race-free.
      if (state.scanning) {
        sendJson(res, 200, { started: false, reason: 'in_progress' })
        return
      }
      void runScan().catch((err) => console.error('[scanner] manual scan failed:', errorMessage(err)))
      sendJson(res, 200, { started: true })
      return
    }
    sendJson(res, 404, { ok: false, error: `no route: ${req.method} ${pathname}` })
  } catch (err) {
    console.error('[scanner] http handler error:', errorMessage(err))
    sendJson(res, 500, { ok: false, error: errorMessage(err) })
  }
}

// ---------------------------------------------------------------------------
// Boot / lifecycle
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function listenWithRetry(server: ReturnType<typeof createServer>, attempts = 20): void {
  server.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attempts > 0) {
      console.log(`[scanner] port ${PORT} busy — retrying in 500ms (${attempts} attempts left)`)
      setTimeout(() => listenWithRetry(server, attempts - 1), 500)
    } else {
      console.error('[scanner] http server error:', err)
    }
  })
  server.listen(PORT, () => {
    console.log('scanner up on 3030')
  })
}

/** Close a previous hot-reload instance (io.close() also closes the http server). */
function closePrevious(): void {
  try {
    g.__scannerIo?.close()
  } catch (err) {
    console.error('[scanner] previous io close failed:', errorMessage(err))
  }
  if (g.__scannerTimer) {
    clearInterval(g.__scannerTimer)
    g.__scannerTimer = undefined
  }
  if (g.__scannerBootTimer) {
    clearTimeout(g.__scannerBootTimer)
    g.__scannerBootTimer = undefined
  }
  g.__scannerServer = undefined
  g.__scannerIo = undefined
}

async function boot(): Promise<void> {
  if (g.__scannerBooted) {
    console.log('[scanner] hot reload detected — rebinding server + timers')
    closePrevious()
  }

  httpServer = createServer((req, res) => void handleHttp(req, res))
  // Sanctioned socket.io config — copied from examples/websocket/server.ts.
  io = new Server(httpServer, {
    // DO NOT change the path, it is used by Caddy to forward the request to the correct port
    path: '/',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  io.on('connection', (socket) => {
    console.log(`[scanner] client connected: ${socket.id}`)
    // Best-effort greeting so fresh clients immediately know the scan state.
    void db.listing
      .count()
      .then((trackedTotal) => {
        socket.emit('scan_status', {
          lastScanAt: state.lastScanAt ? state.lastScanAt.toISOString() : null,
          newListings: 0,
          priceDrops: 0,
          scansCount: state.scansCount,
          trackedTotal,
        })
      })
      .catch(() => {})
    socket.on('disconnect', () => console.log(`[scanner] client disconnected: ${socket.id}`))
    socket.on('error', (err) => console.error(`[scanner] socket error (${socket.id}):`, err))
  })

  // engine.io (path '/') claims EVERY url — its check() is
  // `path === req.url.slice(0, path.length)` with path '/', so plain REST
  // requests would die as {"code":0,"message":"Transport unknown"}.
  // Re-take the request listener: REST routes are ours, everything else is
  // delegated to io.engine.handleRequest — exactly what engine.io's own
  // handler would have called. Socket clients on path '/' are unaffected.
  const engine = io.engine
  httpServer.removeAllListeners('request')
  httpServer.on('request', (req, res) => {
    const { pathname } = new URL(req.url ?? '/', `http://localhost:${PORT}`)
    if (pathname === '/health' || pathname === '/scan') {
      void handleHttp(req, res)
    } else {
      engine.handleRequest(req, res)
    }
  })

  g.__scannerServer = httpServer
  g.__scannerIo = io
  g.__scannerBooted = true

  listenWithRetry(httpServer)

  setSchedule(SCAN_INTERVAL_MS)
  void scanCycle() // immediate first scan
  // Safety-net second boot scan in case the first raced Prisma init.
  g.__scannerBootTimer = setTimeout(() => void scanCycle(), 5_000)
}

function shutdown(signal: string): void {
  console.log(`[scanner] ${signal} received — shutting down`)
  try {
    io?.close()
  } catch {}
  if (g.__scannerTimer) clearInterval(g.__scannerTimer)
  if (g.__scannerBootTimer) clearTimeout(g.__scannerBootTimer)
  void db
    .$disconnect()
    .catch(() => {})
    .finally(() => process.exit(0))
  // Never hang the shutdown on lingering sockets.
  setTimeout(() => process.exit(0), 3_000).unref()
}

// Register crash guards + signal handlers once per process (not per reload).
if (!g.__scannerBooted) {
  process.on('uncaughtException', (err) => console.error('[scanner] uncaughtException:', err))
  process.on('unhandledRejection', (reason) => console.error('[scanner] unhandledRejection:', reason))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
}

void boot().catch((err) => console.error('[scanner] boot failed:', err))
