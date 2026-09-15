/**
 * Local ads ↔ unified listing bridge. Owner-published apartments come from
 * the DB (no external site) and join the same explore pipeline as scraped
 * sources: same card shape, same scoring, same map pins, same detail page.
 */
import { db } from '@/lib/db';
import type { UnifiedDetail, UnifiedListing } from './providers/types';

type LocalRow = {
  id: string;
  deal: string;
  title: string;
  description: string;
  priceUsd: number;
  area: number;
  roomCount: number;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  floorCount: number | null;
  condition: string | null;
  furnished: string | null;
  cityName: string;
  districtName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  photos: string;
  contactName: string;
  contactPhone: string;
  status: string;
  views: number;
  createdAt: Date;
  updatedAt: Date;
  owner: { name: string; tgChatId: string | null; tgUsername: string | null };
};

export function parsePhotos(json: string): string[] {
  try {
    const arr = JSON.parse(json) as unknown;
    return Array.isArray(arr) ? arr.filter((p): p is string => typeof p === 'string' && p.length > 4) : [];
  } catch {
    return [];
  }
}

export function localToListing(row: LocalRow): UnifiedListing {
  const ppsm = row.area > 0 ? Math.round(row.priceUsd / row.area) : 0;
  return {
    key: `local:${row.id}`,
    provider: 'local',
    deal: row.deal === 'rent' ? 'rent' : 'buy',
    objectId: row.id,
    title: row.title,
    priceUsd: row.priceUsd,
    currency: 'USD',
    priceNative: row.priceUsd,
    ppsmUsd: ppsm,
    area: row.area,
    roomCount: row.roomCount,
    bedrooms: row.bedrooms ?? undefined,
    districtName: row.districtName,
    cityName: row.cityName,
    address: row.address ?? undefined,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    floor: row.floor ?? undefined,
    floorCount: row.floorCount ?? undefined,
    image: parsePhotos(row.photos)[0],
    photoCount: parsePhotos(row.photos).length,
    updatedAt: row.updatedAt.toISOString(),
    sourceUrl: `/listing/local/${row.id}`,
    isVip: false,
  };
}

/** DB filter shape shared by explore merge and the detail route. */
export type LocalAdsQuery = {
  deal?: 'buy' | 'rent';
  cityName?: string;
  districtNames?: string[];
  roomCounts?: number[];
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  take?: number;
};

export async function fetchLocalAds(q: LocalAdsQuery): Promise<UnifiedListing[]> {
  const where = {
    status: 'active',
    ...(q.deal ? { deal: q.deal } : {}),
    ...(q.cityName ? { cityName: { equals: q.cityName.trim() } } : {}),
    ...(q.districtNames && q.districtNames.length > 0
      ? { districtName: { in: q.districtNames.map((d) => d.trim()) } }
      : {}),
    ...(q.roomCounts && q.roomCounts.length > 0 ? { roomCount: { in: q.roomCounts } } : {}),
    ...(q.minPrice !== undefined || q.maxPrice !== undefined
      ? {
          priceUsd: {
            ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}),
            ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}),
          },
        }
      : {}),
    ...(q.minArea !== undefined || q.maxArea !== undefined
      ? {
          area: {
            ...(q.minArea !== undefined ? { gte: q.minArea } : {}),
            ...(q.maxArea !== undefined ? { lte: q.maxArea } : {}),
          },
        }
      : {}),
  };
  const rows = await db.localListing.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(q.take ?? 24, 40),
    include: { owner: { select: { name: true, tgChatId: true, tgUsername: true } } },
  });
  return rows.map(localToListing);
}

/** Full detail for the offer page (owner-listing variant, no external sync). */
export async function fetchLocalDetail(id: string): Promise<UnifiedDetail> {
  const row = await db.localListing.findUnique({
    where: { id },
    include: { owner: { select: { name: true, tgChatId: true, tgUsername: true } } },
  });
  if (!row || row.status !== 'active') {
    const err = new Error('local listing not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  const listing = localToListing(row);
  const photos = parsePhotos(row.photos);
  return {
    listing,
    descriptionHtml: row.description.replace(/\n/g, '<br/>'),
    photos: photos.map((p) => ({ large: p })),
    params: {
      bathroomCount: row.bathrooms ?? undefined,
      condition: row.condition ?? undefined,
      furnished: row.furnished ?? undefined,
    },
    seller: {
      name: row.contactName || row.owner.name,
      type: 'owner',
      isOwner: true,
    },
    views: row.views,
    createdAt: row.createdAt.toISOString(),
    priceHistory: [],
    syncedAt: row.updatedAt.toISOString(),
    local: {
      contactName: row.contactName || row.owner.name,
      contactPhone: row.contactPhone,
      furnished: row.furnished ?? undefined,
    },
  };
}

/** Fire-and-forget view counter for local ads. */
export function bumpLocalViews(id: string): void {
  db.localListing
    .update({ where: { id }, data: { views: { increment: 1 } } })
    .catch(() => {});
}
