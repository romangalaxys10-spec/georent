/**
 * /api/ads — owner's local listings.
 * GET  (auth) → own listings with interest counts
 * POST (auth) → publish a new ad
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUser } from '@/lib/auth';

export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 400_000; // per data-URI (client compresses)

type AdInput = {
  deal?: string;
  title?: string;
  description?: string;
  priceUsd?: number;
  area?: number;
  roomCount?: number;
  bedrooms?: number;
  bathrooms?: number;
  floor?: number;
  floorCount?: number;
  condition?: string;
  furnished?: string;
  cityName?: string;
  districtName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  photos?: string[];
  contactName?: string;
  contactPhone?: string;
};

function sanitizePhotos(photos: string[] | undefined): { ok: true; value: string } | { ok: false; error: string } {
  if (!photos || photos.length === 0) return { ok: true, value: '[]' };
  if (photos.length > MAX_PHOTOS) return { ok: false, error: `max ${MAX_PHOTOS} photos` };
  for (const p of photos) {
    if (typeof p !== 'string' || p.length < 5) return { ok: false, error: 'invalid photo' };
    const isData = p.startsWith('data:image/');
    const isUrl = /^https?:\/\//i.test(p);
    if (!isData && !isUrl) return { ok: false, error: 'photos must be data-URIs or https URLs' };
    if (p.length > MAX_PHOTO_BYTES) return { ok: false, error: 'photo too large (max ~400KB — compress before upload)' };
  }
  return { ok: true, value: JSON.stringify(photos) };
}

function validateAd(ad: AdInput): string | null {
  if (ad.deal !== 'buy' && ad.deal !== 'rent') return 'deal must be buy or rent';
  if (!ad.title || ad.title.trim().length < 5 || ad.title.length > 120) return 'title must be 5-120 chars';
  if (ad.description && ad.description.length > 4000) return 'description too long (max 4000)';
  if (typeof ad.priceUsd !== 'number' || ad.priceUsd < 10 || ad.priceUsd > 50_000_000) return 'priceUsd must be 10-50,000,000';
  if (typeof ad.area !== 'number' || ad.area < 5 || ad.area > 2000) return 'area must be 5-2000 m²';
  if (typeof ad.roomCount !== 'number' || ad.roomCount < 0 || ad.roomCount > 20) return 'roomCount 0-20';
  if (!ad.districtName || ad.districtName.trim().length < 2) return 'district required';
  if (!ad.contactName || ad.contactName.trim().length < 2) return 'contact name required';
  if (!ad.contactPhone || !/^[+0-9()\-\s]{6,20}$/.test(ad.contactPhone)) return 'valid contact phone required';
  return null;
}

export async function GET(request: Request) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const listings = await db.localListing.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { interests: true } } },
  });
  return NextResponse.json({
    listings: listings.map((l) => ({
      ...l,
      photos: JSON.parse(l.photos) as string[],
      interestCount: l._count.interests,
      _count: undefined,
    })),
  });
}

export async function POST(request: Request) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as AdInput | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const invalid = validateAd(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const photos = sanitizePhotos(body.photos);
  if (!photos.ok) return NextResponse.json({ error: photos.error }, { status: 400 });

  const created = await db.localListing.create({
    data: {
      ownerId: user.id,
      deal: body.deal!,
      title: body.title!.trim(),
      description: (body.description ?? '').trim(),
      priceUsd: body.priceUsd!,
      area: body.area!,
      roomCount: Math.round(body.roomCount ?? 0),
      bedrooms: body.bedrooms ?? undefined,
      bathrooms: body.bathrooms ?? undefined,
      floor: body.floor ?? undefined,
      floorCount: body.floorCount ?? undefined,
      condition: body.condition || undefined,
      furnished: body.furnished || undefined,
      cityName: (body.cityName ?? 'Tbilisi').trim(),
      districtName: body.districtName!.trim(),
      address: body.address?.trim() || undefined,
      lat: body.lat ?? undefined,
      lng: body.lng ?? undefined,
      photos: photos.value,
      contactName: body.contactName!.trim(),
      contactPhone: body.contactPhone!.trim(),
    },
  });
  return NextResponse.json({ id: created.id, key: `local:${created.id}` }, { status: 201 });
}
