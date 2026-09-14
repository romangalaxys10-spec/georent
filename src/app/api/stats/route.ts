/**
 * /api/stats — district ppsm percentiles (server-side route handler).
 *
 * GET ?cityId=1 → {citywide: {p25,p50,sampleCount}, districts: [{districtId,
 * p25, p50, sampleCount}]} — read exclusively from the DistrictStat table
 * (written by the scanner); no upstream calls. The citywide sampleCount is
 * the TOTAL tracked listings for the city (real COUNT query — the DistrictStat
 * row with districtId null only pools listings whose district could not be
 * resolved, which is NOT citywide). Missing rows yield nulls / 0.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    const [rows, trackedTotal] = await Promise.all([
      db.districtStat.findMany({ where: { cityId } }),
      db.listing.count({ where: { cityId, isSold: false } }),
    ])
    const citywideRow = rows.find((r) => r.districtId === null)
    const districts = rows
      .filter((r): r is typeof r & { districtId: number } => r.districtId !== null)
      .sort((a, b) => a.districtId - b.districtId)
      .map((r) => ({
        districtId: r.districtId,
        p25: r.p25,
        p50: r.p50,
        sampleCount: r.sampleCount,
      }))

    return NextResponse.json({
      cityId,
      citywide: {
        p25: citywideRow?.p25 ?? null,
        p50: citywideRow?.p50 ?? null,
        sampleCount: trackedTotal,
      },
      districts,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    )
  }
}
