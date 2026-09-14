/**
 * Smoke test for the korter data layer (Task 1).
 * Run: bun scripts/smoke-adapter.ts
 *
 * 1. fetchCards({cityId:1, sort:'update_time_desc', limit:5}) → 5 real listings w/ prices
 * 2. fetchDistricts(1) → district list (expect ≥10)
 * 3. computeDealScores on those 5 → scores in 0..100
 * 4. bonus: classifySeen sanity checks (pure, no network)
 */
import { classifySeen, fetchCards, fetchDistricts } from '../src/lib/korter/adapter'
import { computeDealScores } from '../src/lib/korter/score'
import type { KorterListing } from '../src/lib/korter/types'

async function main(): Promise<void> {
  console.log('=== 1. fetchCards({cityId:1, sort:"update_time_desc", limit:5}) ===')
  const cards = await fetchCards({ cityId: 1, sort: 'update_time_desc', limit: 5 })
  console.log(`source=${cards.source} count=${cards.listings.length}`)
  if (cards.listings.length !== 5) {
    throw new Error(`expected 5 listings, got ${cards.listings.length}`)
  }
  for (const l of cards.listings) {
    console.log(
      `  #${l.objectId}  $${l.price.toLocaleString('en-US')}  ${l.area}m²  ` +
        `${l.roomCount}rm  ppsm=$${l.ppsm.toFixed(1)}  ` +
        `[${l.districtName ?? '—'}]  ${l.actualizeTime.toISOString()}  ${l.link}`,
    )
  }

  console.log('\n=== 2. fetchDistricts(1) ===')
  const districts = await fetchDistricts(1)
  console.log(`districts=${districts.length}`)
  for (const d of districts) {
    console.log(`  ${d.id}  ${d.name}`)
  }
  if (districts.length < 10) {
    throw new Error(`expected ≥10 districts, got ${districts.length}`)
  }

  console.log('\n=== 3. computeDealScores(the 5 listings) ===')
  const scored = computeDealScores(
    cards.listings.map((l: KorterListing) => ({
      districtId: l.districtId,
      districtName: l.districtName,
      ppsm: l.ppsm,
    })),
  )
  if (scored.length !== cards.listings.length) {
    throw new Error('computeDealScores changed result length')
  }
  scored.forEach((s, i) => {
    if (s.score < 0 || s.score > 100) throw new Error(`score out of range: ${s.score}`)
    console.log(
      `  #${cards.listings[i].objectId}  ppsm=$${cards.listings[i].ppsm.toFixed(1)}  ` +
        `score=${s.score}  basis=${s.basis}  [${cards.listings[i].districtName ?? '—'}]`,
    )
  })

  console.log('\n=== 4. classifySeen sanity (no network) ===')
  const base = cards.listings[0]
  const mkListing = (price: number, actualizeTime: Date): KorterListing => ({
    ...base,
    price,
    actualizeTime,
  })
  const t0 = new Date('2026-09-14T08:00:00Z')
  const t1 = new Date('2026-09-14T10:00:00Z')
  const existing = { lastPrice: 100_000, actualizeTime: t0 }
  const checks: [string, ReturnType<typeof classifySeen>][] = [
    ['never seen → NEW', classifySeen(null, mkListing(90_000, t1))],
    ['price -10% → PRICE_DROP', classifySeen(existing, mkListing(90_000, t1))],
    ['price -0.1% (noise) → BUMP', classifySeen(existing, mkListing(99_900, t1))],
    ['same price, re-actualized → BUMP', classifySeen(existing, mkListing(100_000, t1))],
    ['same price, same time → SAME', classifySeen(existing, mkListing(100_000, t0))],
    ['price +10% → SAME', classifySeen(existing, mkListing(110_000, t1))],
  ]
  for (const [label, kind] of checks) console.log(`  ${label}: ${kind}`)

  console.log('\nALL SMOKE CHECKS PASSED')
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err)
  process.exit(1)
})
