/**
 * /api/ads/[id]/interests — owner's leads for one listing.
 * GET   (auth, owner) → { interests }
 * PATCH (auth, owner) → mark read: { ids: string[] } | { all: true }
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUser } from '@/lib/auth';

async function ownListing(userId: string, id: string) {
  const listing = await db.localListing.findUnique({ where: { id } });
  return listing && listing.ownerId === userId ? listing : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  if (!(await ownListing(user.id, id))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const interests = await db.interest.findMany({
    where: { listingId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ interests });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await context.params;
  if (!(await ownListing(user.id, id))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as {
    ids?: string[];
    all?: boolean;
  } | null;
  const data = { readAt: new Date() };
  if (body?.all) {
    await db.interest.updateMany({ where: { listingId: id, readAt: null }, data });
  } else if (Array.isArray(body?.ids) && body.ids.length > 0) {
    await db.interest.updateMany({
      where: { listingId: id, id: { in: body.ids.slice(0, 100) } },
      data,
    });
  } else {
    return NextResponse.json({ error: 'ids or all required' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
