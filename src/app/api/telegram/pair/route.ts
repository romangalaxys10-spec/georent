/**
 * POST /api/telegram/pair (auth) → { code, botUsername?, webhookMode }
 * GET  → current pairing state (paired? username? pending code?)
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUser } from '@/lib/auth';
import { BOT_USERNAME, botConfigured, createPairCode } from '@/lib/telegram';

export async function GET(request: Request) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { tgChatId: true, tgUsername: true, tgPairCode: true, tgPairCodeExpiresAt: true },
  });
  const pending =
    row?.tgPairCode && row.tgPairCodeExpiresAt && row.tgPairCodeExpiresAt > new Date()
      ? row.tgPairCode
      : null;
  return NextResponse.json({
    configured: botConfigured(),
    botUsername: BOT_USERNAME || null,
    paired: Boolean(row?.tgChatId),
    tgUsername: row?.tgUsername ?? null,
    pendingCode: pending,
  });
}

export async function POST(request: Request) {
  const user = await authUser(request);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!botConfigured()) {
    return NextResponse.json(
      { error: 'Telegram bot is not configured on this deployment (set TELEGRAM_BOT_TOKEN)' },
      { status: 503 },
    );
  }
  const code = await createPairCode(user.id);
  return NextResponse.json({
    code,
    botUsername: BOT_USERNAME || null,
    webhookMode: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
  });
}
