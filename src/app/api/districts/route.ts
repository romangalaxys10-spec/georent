/**
 * /api/districts — korter district list per city (server-side route handler).
 *
 * GET ?cityId=1 → [{id, name, link}] via adapter.fetchDistricts, memoized
 * in-memory per cityId for 6 hours (cache survives dev-server HMR).
 * Upstream failure → 502 {error:'upstream'}.
 */
import { NextResponse } from 'next/server'
import { fetchDistricts } from '@/lib/korter/adapter'
import type { KorterDistrict } from '@/lib/korter/types'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

type CacheEntry = { value: KorterDistrict[]; expiresAt: number }

/** Cache singleton persisted across dev-server HMR reloads. */
function cache(): Map<number, CacheEntry> {
  const g = globalThis as unknown as { __districtsCache?: Map<number, CacheEntry> }
  if (!g.__districtsCache) g.__districtsCache = new Map()
  return g.__districtsCache
}

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const rawCityId = sp.get('cityId')
    let cityId = 1
    if (rawCityId !== null && rawCityId.trim() !== '') {
      cityId = Number(rawCityId)
      if (!Number.isInteger(cityId) || cityId <= 0) {
        return NextResponse.json({ error: 'cityId must be a positive integer' }, { status: 400 })
      }
    }

    const now = Date.now()
    const hit = cache().get(cityId)
    if (hit && hit.expiresAt > now) {
      return NextResponse.json({ cityId, districts: hit.value })
    }

    const districts = await fetchDistricts(cityId)
    cache().set(cityId, { value: districts, expiresAt: Date.now() + CACHE_TTL_MS })
    return NextResponse.json({ cityId, districts })
  } catch {
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
}
