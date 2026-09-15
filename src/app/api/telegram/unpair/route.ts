/** POST /api/telegram/unpair (auth) — detach the Telegram chat. */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await db.user.update({
    where: { id: user.id },
    data: { tgChatId: null, tgUsername: null, tgPairedAt: null, tgPairCode: null, tgPairCodeExpiresAt: null },
  });
  return NextResponse.json({ ok: true });
}
