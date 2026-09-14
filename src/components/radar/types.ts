/**
 * Shared client-side types for the radar UI.
 *
 * The explore API now fans out to ALL sources (korter + ss.ge + myhome.ge),
 * so every result is a `UnifiedListing` — normalized across providers — plus
 * the deal-score fields computed over the merged batch.
 */
import type { ProviderRunStatus, UnifiedListing } from '@/lib/providers/types'

/** One merged + scored listing in the feed. */
export type ScoredListing = UnifiedListing & {
  /** 0..100, higher = cheaper per m². */
  score: number
  basis: 'district' | 'city' | 'none'
}

/** GET /api/explore response envelope. */
export type ExploreResponse = {
  listings: ScoredListing[]
  sources: ProviderRunStatus[]
  total: number
  fetchedAt: string
  cached: boolean
  offset: number
  limit: number
}

/** GET /api/districts response envelope. */
export type DistrictsResponse = {
  cityId: number;
  districts: { id: number; name: string; link: string | null }[];
};

/** GET /api/stats response envelope (DistrictStat rows only). */
export type StatsResponse = {
  cityId: number;
  citywide: { p25: number | null; p50: number | null; sampleCount: number };
  districts: { districtId: number; p25: number; p50: number; sampleCount: number }[];
};

/** Korter main-city geo ids. */
export const CITIES = [
  { id: 1, name: 'Tbilisi' },
  { id: 2, name: 'Batumi' },
] as const;

/**
 * GET /api/alerts row (server shape) — also the normalized render shape for
 * demo-mode alerts (use-demo converts native arrays to the stored JSON
 * strings so both transports feed the same row components).
 */
export type AlertItem = {
  id: string;
  name: string;
  minPrice: number | null;
  maxPrice: number | null;
  cityId: number;
  /** JSON string array of korter district ids (stored shape). */
  districtIds: string;
  /** JSON string array of room counts (stored shape). */
  roomCounts: string;
  minArea: number | null;
  maxArea: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  matchCount: number;
};
