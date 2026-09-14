/**
 * Deal scoring — pure functions, no DB access, fully deterministic.
 *
 * A listing's deal score (0..100, higher = cheaper per m² = better deal) is the
 * percentile rank of its ppsm (price per m²) among peers:
 *
 *   1. district percentile — rank of ppsm among listings in the same district
 *   2. city percentile     — rank of ppsm among ALL listings in the batch
 *   3. final = w·district + (1−w)·city, with shrinkage w = n/(n+30)
 *      where n = district sample count. With n < 5, w < 0.143 → the score is
 *      mostly the city percentile ("warming up" state, per spec).
 *
 * Ties get the identical percentile (mid-rank), so equal ppsm → equal score.
 */

export type DealScoreInput = {
  districtId?: number | null
  districtName?: string | null
  ppsm?: number | null
}

export type DealScored = DealScoreInput & {
  /** 0..100, higher = cheaper per m². 0 when ppsm is missing/≤0. */
  score: number
  /** Which pool dominated: district+city shrinkage, city only, or unscorable. */
  basis: 'district' | 'city' | 'none'
}

/** Shrinkage constant: district percentile is trusted fully as n → ∞. */
const SHRINK_K = 30

/** Group listings into districts, preferring the stable id, else the name. */
function districtKey(l: DealScoreInput): string | null {
  if (typeof l.districtId === 'number' && Number.isFinite(l.districtId)) {
    return `id:${l.districtId}`
  }
  if (typeof l.districtName === 'string' && l.districtName.trim().length > 0) {
    return `name:${l.districtName.trim().toLowerCase()}`
  }
  return null
}

/**
 * Percentile of x within an ascending-sorted array, mid-rank style:
 * rank = (countLess + 0.5·countEqual) / n  →  score = 100·(1 − rank).
 * Cheapest single listing in a large pool ≈ 100, most expensive ≈ 0,
 * identical values always produce identical results.
 */
function percentileScore(sortedAsc: number[], x: number): number {
  const n = sortedAsc.length
  if (n <= 1) return 50
  // first index with value >= x
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedAsc[mid] < x) lo = mid + 1
    else hi = mid
  }
  const less = lo
  // first index with value > x
  hi = n
  let lo2 = lo
  while (lo2 < hi) {
    const mid = (lo2 + hi) >> 1
    if (sortedAsc[mid] <= x) lo2 = mid + 1
    else hi = mid
  }
  const equal = lo2 - less
  const rank = (less + 0.5 * equal) / n
  return Math.round(100 * (1 - rank) * 10) / 10
}

/**
 * Compute deal scores for a batch of listings. Order of results matches the
 * order of the input. Listings with ppsm ≤ 0 / null / undefined are unscorable
 * (score 0, basis 'none') and are excluded from every peer pool.
 */
export function computeDealScores(listings: DealScoreInput[]): DealScored[] {
  // Collect scorable entries.
  const scorable: { index: number; ppsm: number; key: string | null }[] = []
  for (let i = 0; i < listings.length; i++) {
    const ppsm = listings[i].ppsm
    if (typeof ppsm === 'number' && Number.isFinite(ppsm) && ppsm > 0) {
      scorable.push({ index: i, ppsm, key: districtKey(listings[i]) })
    }
  }

  // City-wide pool (all scorable listings).
  const cityPool = scorable.map((s) => s.ppsm).sort((a, b) => a - b)

  // District pools: key → ascending ppsm array (insertion via binary insert
  // keeps things deterministic without a full re-sort per group).
  const districtPools = new Map<string, number[]>()
  for (const s of scorable) {
    if (s.key === null) continue
    let pool = districtPools.get(s.key)
    if (!pool) {
      pool = []
      districtPools.set(s.key, pool)
    }
    pool.push(s.ppsm)
  }
  for (const pool of districtPools.values()) pool.sort((a, b) => a - b)

  const results: DealScored[] = new Array(listings.length)
  const byIndex = new Map(scorable.map((s) => [s.index, s]))

  for (let i = 0; i < listings.length; i++) {
    const s = byIndex.get(i)
    if (!s) {
      results[i] = { ...listings[i], score: 0, basis: 'none' }
      continue
    }
    const cityScore = percentileScore(cityPool, s.ppsm)
    const pool = s.key !== null ? districtPools.get(s.key) : undefined
    if (!pool) {
      results[i] = { ...listings[i], score: cityScore, basis: 'city' }
      continue
    }
    const n = pool.length
    const w = n / (n + SHRINK_K) // n < 5 → w < 0.143 → mostly city percentile
    const districtScore = percentileScore(pool, s.ppsm)
    const blended = w * districtScore + (1 - w) * cityScore
    results[i] = {
      ...listings[i],
      score: Math.round(blended * 10) / 10,
      basis: 'district',
    }
  }

  return results
}
