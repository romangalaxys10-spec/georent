/**
 * Pure demo-mode classification + alert matching — a faithful port of the
 * scanner mini-service logic (mini-services/scanner/index.ts) to a
 * stateless contract: the "seen" baseline (objectId → last price) travels
 * with the request instead of living in SQLite.
 */

export type DemoAlert = {
  id: string;
  name: string;
  cityId: number;
  minPrice: number | null;
  maxPrice: number | null;
  minArea: number | null;
  maxArea: number | null;
  districtIds: number[];
  roomCounts: number[];
  active: boolean;
  /** ISO creation time — gates the client-side match count like the DB does. */
  createdAt?: string;
};

/** One observed listing in the client baseline (compact keys for localStorage). */
export type SeenEntry = {
  p: number; // last price
  d: number | null; // districtId (server-resolved)
  r: number; // roomCount
  a: number; // area
  c: number; // cityId
  f: number; // first-seen epoch ms (kept from the previous baseline if present)
};

export type SeenMap = Record<string, SeenEntry>;

export type Observation = {
  objectId: number;
  p: number;
  d: number | null;
  r: number;
  a: number;
  c: number;
};

export type SeenKind = 'NEW' | 'PRICE_DROP' | 'SAME';

/** Drop threshold below the seen price (>0.5%) — same rule as classifySeen. */
export function classifyAgainstSeen(
  seen: Pick<SeenEntry, 'p'> | undefined,
  price: number,
): SeenKind {
  if (!seen || typeof seen.p !== 'number') return 'NEW';
  if (seen.p > 0 && price < seen.p * 0.995) return 'PRICE_DROP';
  return 'SAME';
}

function matches(alert: DemoAlert, listing: {
  cityId: number;
  price: number;
  area: number;
  roomCount: number;
  districtId: number | null;
}): boolean {
  if (alert.cityId !== listing.cityId) return false;
  if (alert.minPrice != null && Number.isFinite(alert.minPrice) && listing.price < alert.minPrice) return false;
  if (alert.maxPrice != null && Number.isFinite(alert.maxPrice) && listing.price > alert.maxPrice) return false;
  if (alert.roomCounts.length > 0 && !alert.roomCounts.includes(listing.roomCount)) return false;
  if (alert.minArea != null && Number.isFinite(alert.minArea) && listing.area < alert.minArea) return false;
  if (alert.maxArea != null && Number.isFinite(alert.maxArea) && listing.area > alert.maxArea) return false;
  if (alert.districtIds.length === 0) return true;
  return listing.districtId != null && alert.districtIds.includes(listing.districtId);
}

export { matches as matchDemoAlert };
