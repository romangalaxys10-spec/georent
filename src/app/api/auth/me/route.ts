/**
 * GET /api/auth/me — bearer token → current user profile (incl. Telegram
 * pairing state + unread interest count for the dashboard badge).
 * 401 when the token is missing/unknown.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUser } from '@/lib/auth';

export async function GET(request: Request) {
  const user = await authUser(request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [listings, unread, pendingPair] = await Promise.all([
    db.localListing.count({ where: { ownerId: user.id, status: 'active' } }),
    db.interest.count({
      where: { listing: { ownerId: user.id }, readAt: null },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { tgPairCode: true, tgPairCodeExpiresAt: true },
    }),
  ]);
  const pairFresh =
    pendingPair?.tgPairCode &&
    pendingPair.tgPairCodeExpiresAt &&
    pendingPair.tgPairCodeExpiresAt > new Date();
  return NextResponse.json({
    user,
    stats: { activeListings: listings, unreadInterests: unread },
    pendingPairCode: pairFresh ? pendingPair.tgPairCode : null,
  });
}
