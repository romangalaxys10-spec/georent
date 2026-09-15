/**
 * POST /api/ads/[id]/interest — PUBLIC lead capture on a local ad.
 * Records the interest, notifies the owner over Telegram when paired,
 * and always keeps it in the owner's dashboard. Rate-limited per IP.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifyOwner } from '@/lib/telegram';

// Naive in-memory rate limit: 5 leads per minute per IP per listing.
const hits = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > 5;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(`${ip}:${id}`)) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  const listing = await db.localListing.findUnique({
    where: { id },
    include: { owner: { select: { id: true, tgChatId: true, name: true } } },
  });
  if (!listing || listing.status !== 'active') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    phone?: string;
    message?: string;
  } | null;
  const name = (body?.name ?? '').trim();
  const phone = (body?.phone ?? '').trim();
  const message = (body?.message ?? '').trim().slice(0, 500);
  if (name.length < 2 || !/^[+0-9()\-\s]{6,20}$/.test(phone)) {
    return NextResponse.json({ error: 'name and a valid phone are required' }, { status: 400 });
  }

  const interest = await db.interest.create({
    data: { listingId: id, name, phone, message: message || null },
  });

  // Telegram delivery is best-effort — the lead is already persisted.
  let telegram: 'sent' | 'not_paired' | 'failed' = 'not_paired';
  if (listing.owner.tgChatId) {
    telegram = (await notifyOwner({
      chatId: listing.owner.tgChatId,
      listing,
      interest: { name, phone, message },
      interestId: interest.id,
    }))
      ? 'sent'
      : 'failed';
  }

  return NextResponse.json({ ok: true, notified: telegram }, { status: 201 });
}
