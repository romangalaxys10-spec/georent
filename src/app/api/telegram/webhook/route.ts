/**
 * POST /api/telegram/webhook — Telegram updates in webhook mode.
 * Handles `/start <pairCode>` by binding the chat to the user and
 * confirming. All other updates are acknowledged and ignored.
 * Enabled only when TELEGRAM_WEBHOOK_SECRET is set; the secret header
 * Telegram sends is verified on every call.
 */
import { NextResponse } from 'next/server';
import { bindPairCode, sendPairConfirmation, sendRawMessage, webhookAuthorized } from '@/lib/telegram';

export async function POST(request: Request) {
  if (!webhookAuthorized(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const update = (await request.json().catch(() => null)) as {
    message?: {
      text?: string;
      chat?: { id?: number | string };
      from?: { username?: string };
    };
  } | null;

  const text = update?.message?.text ?? '';
  const chatId = update?.message?.chat?.id;
  if (chatId !== undefined && /^\/start\s+(\d{6})\s*$/.test(text)) {
    const code = text.replace(/^\/start\s+/, '').trim();
    const bound = await bindPairCode(code, String(chatId), update?.message?.from?.username);
    if (bound) {
      await sendPairConfirmation(String(chatId), bound.name);
    } else {
      await sendRawMessage(
        String(chatId),
        '❌ Unknown or expired code. Open DealRadar → My Ads → Pair Telegram to get a fresh code, then send /start <code> again.',
      );
    }
  }
  // Always 200 so Telegram does not retry-storm on non-fatal payloads.
  return NextResponse.json({ ok: true });
}
