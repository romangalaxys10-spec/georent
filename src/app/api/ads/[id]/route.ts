/**
 * /api/ads/[id] — manage one of the owner's local listings.
 * PATCH (auth, owner) → edit fields or flip status active|paused
 * DELETE (auth, owner) → remove the ad (interests cascade)
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUser } from '@/lib/auth';
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from '../route';

const CONDITIONS = new Set(['new', 'renovated', 'old', 'under_construction']);
const FURNISHED = new Set(['yes', 'no', 'partial']);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;

  const existing = await db.localListing.findUnique({ where: { id } });
  if (!existing || existing.ownerId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'paused') {
      return NextResponse.json({ error: 'status must be active or paused' }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (t.length < 5 || t.length > 120) return NextResponse.json({ error: 'title must be 5-120 chars' }, { status: 400 });
    data.title = t;
  }
  if (body.description !== undefined) data.description = String(body.description).slice(0, 4000);
  if (body.priceUsd !== undefined) {
    const p = Number(body.priceUsd);
    if (!Number.isFinite(p) || p < 10 || p > 50_000_000) return NextResponse.json({ error: 'bad price' }, { status: 400 });
    data.priceUsd = p;
  }
  if (body.condition !== undefined) {
    if (body.condition !== null && body.condition !== '' && !CONDITIONS.has(String(body.condition))) {
      return NextResponse.json({ error: 'bad condition' }, { status: 400 });
    }
    data.condition = body.condition || null;
  }
  if (body.furnished !== undefined) {
    if (body.furnished !== null && body.furnished !== '' && !FURNISHED.has(String(body.furnished))) {
      return NextResponse.json({ error: 'bad furnished value' }, { status: 400 });
    }
    data.furnished = body.furnished || null;
  }
  if (Array.isArray(body.photos)) {
    const photos = body.photos as string[];
    if (photos.length > MAX_PHOTOS) return NextResponse.json({ error: `max ${MAX_PHOTOS} photos` }, { status: 400 });
    for (const p of photos) {
      if (typeof p !== 'string' || p.length > MAX_PHOTO_BYTES || !(p.startsWith('data:image/') || /^https?:\/\//i.test(p))) {
        return NextResponse.json({ error: 'invalid photo entry' }, { status: 400 });
      }
    }
    data.photos = JSON.stringify(photos);
  }

  const updated = await db.localListing.update({ where: { id }, data });
  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const existing = await db.localListing.findUnique({ where: { id } });
  if (!existing || existing.ownerId !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  await db.localListing.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
