/**
 * Live validation of the multi-provider layer — REAL network calls only.
 * Run: bun scripts/validate-providers.ts
 */
import { searchAllProviders, fetchUnifiedDetail } from '../src/lib/providers/index'
import type { UnifiedFilters } from '../src/lib/providers/types'

async function main() {
  console.log('=== 1. basic unified search (Tbilisi) ===')
  const base: UnifiedFilters = { cityId: 1, page: 1, perPage: 20 }
  const t0 = Date.now()
  const r1 = await searchAllProviders(base)
  console.log(`elapsed ${Date.now() - t0}ms`)
  for (const s of r1.statuses) {
    console.log(`  ${s.id.padEnd(7)} ${s.status.padEnd(9)} n=${s.count} total=${s.total ?? '?'} ${Math.round(s.durationMs)}ms ${s.error ?? ''}`)
  }
  console.log(`  merged: ${r1.listings.length}`)
  const sample = r1.listings[0]
  console.log('  sample:', JSON.stringify({
    key: sample.key, provider: sample.provider, price: sample.priceUsd, ppsm: sample.ppsmUsd,
    area: sample.area, rooms: sample.roomCount, district: sample.districtName,
    url: sample.sourceUrl, updatedAt: sample.updatedAt, score: sample.score, basis: sample.basis,
  }))
  const urls = r1.listings.filter((l) => l.provider !== 'korter').slice(0, 3).map((l) => l.sourceUrl)
  console.log('  source urls:', urls)

  console.log('=== 2. filters: price 50k-120k, 40-90m2, rooms 2,3 ===')
  const r2 = await searchAllProviders({ ...base, minPrice: 50000, maxPrice: 120000, minArea: 40, maxArea: 90, roomCounts: [2, 3] })
  for (const s of r2.statuses) console.log(`  ${s.id.padEnd(7)} n=${s.count} total=${s.total ?? '?'}`)
  const bad = r2.listings.filter((l) => (l.priceUsd > 0 && (l.priceUsd < 48000 || l.priceUsd > 125000)))
  console.log(`  price violations: ${bad.length}/${r2.listings.length}`)
  const badArea = r2.listings.filter((l) => l.area > 0 && (l.area < 38 || l.area > 92))
  console.log(`  area violations: ${badArea.length}/${r2.listings.length}`)
  const badRooms = r2.listings.filter((l) => l.roomCount > 0 && ![2, 3].includes(l.roomCount))
  console.log(`  rooms violations: ${badRooms.length}/${r2.listings.length}`)

  console.log('=== 3. extended: bedrooms=2, floor 2-8, keyword ===')
  const r3 = await searchAllProviders({ ...base, bedrooms: [2], minFloor: 2, maxFloor: 8 })
  for (const s of r3.statuses) console.log(`  ${s.id.padEnd(7)} n=${s.count} ${s.status}`)
  const floorOk = r3.listings.filter((l) => l.floor !== undefined).every((l) => (l.floor ?? 0) >= 2 && (l.floor ?? 0) <= 8)
  console.log(`  floor range respected: ${floorOk}`)
  const r3b = await searchAllProviders({ ...base, keyword: 'Vake' })
  const vake = r3b.listings.filter((l) => l.provider !== 'korter')
  console.log(`  keyword Vake: ${vake.length} tnet hits, sample: ${vake[0]?.title} @ ${vake[0]?.districtName}`)

  console.log('=== 4. cross-source duplicates ===')
  const dups = r1.listings.filter((l) => (l.alsoOn?.length ?? 0) > 0)
  console.log(`  cross-listed: ${dups.length}`)
  for (const d of dups.slice(0, 3)) console.log(`    ${d.key} alsoOn=${d.alsoOn?.join(',')} ${d.priceUsd}$ ${d.area}m2`)

  console.log('=== 5. details per provider ===')
  const pick = (p: string) => r1.listings.find((l) => l.provider === p)
  for (const p of ['ss', 'myhome'] as const) {
    const l = pick(p)
    if (!l) { console.log(`  ${p}: NO CARD`); continue }
    const d = await fetchUnifiedDetail(p, l.objectId)
    console.log(`  ${p} ${l.objectId}: photos=${d.photos.length} desc=${(d.descriptionHtml ?? '').slice(0, 60).replace(/\n/g, ' ')}... cond=${d.params.condition ?? '?'} seller=${d.seller?.name ?? '?'} views=${d.views ?? '?'} history=${d.priceHistory?.length ?? 0}pts`)
  }
  const kl = pick('korter')
  if (kl) {
    const d = await fetchUnifiedDetail('korter', kl.objectId, kl.sourceUrl)
    console.log(`  korter ${kl.objectId}: photos=${d.photos.length} desc=${(d.descriptionHtml ?? '').slice(0, 60).replace(/\n/g, ' ')}... seller=${d.seller?.name ?? '?'} beds=${d.listing.bedrooms ?? '?'}`)
  }

  console.log('=== 6. detail 404 path ===')
  try {
    await fetchUnifiedDetail('ss', '99999999999')
    console.log('  ss 99999999999: NO ERROR (unexpected)')
  } catch (e) {
    console.log(`  ss 99999999999 → ${e instanceof Error ? e.message : e}`)
  }

  console.log('=== 7. batumi (cityId 2) ===')
  const r7 = await searchAllProviders({ ...base, cityId: 2 })
  for (const s of r7.statuses) console.log(`  ${s.id.padEnd(7)} n=${s.count} cities=${new Set(r7.listings.filter((l) => l.provider === s.id).map((l) => l.cityName)).size}`)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
