/**
 * Telegram pairing + owner notifications.
 *
 * Pairing flow (works with ANY bot token from @BotFather, no webhook needed):
 *   1. Owner taps "Pair Telegram" in the dashboard → POST /api/telegram/pair
 *      → 6-digit code (15 min TTL) shown in the UI.
 *   2. Owner opens the bot and sends `/start <code>`.
 *   3. Delivery path (whichever is configured):
 *        • webhook mode: Telegram calls POST /api/telegram/webhook
 *          (secret header checked against TELEGRAM_WEBHOOK_SECRET);
 *        • polling mode: mini-services/scanner getUpdates loop calls
 *          bindPairCode() every 90s.
 *   4. bindPairCode() resolves the code → stores chat_id on the user.
 *
 * Interest notifications: notifyOwner() sends a formatted message to the
 * owner's chat when someone taps "I'm interested" on their ad.
 *
 * Config (env): TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME (display),
 * TELEGRAM_WEBHOOK_SECRET (webhook mode only). Missing token → pairing UI
 * shows setup instructions and interests stay dashboard-only.
 */

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN ?? '';
const WEBHOOK_SECRET = () => process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

export const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? '';
export const botConfigured = (): boolean => BOT_TOKEN().length > 20;

async function tgApi(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  if (!botConfigured()) return { ok: false, description: 'bot token not configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN()}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : String(err) };
  }
}

/** Create (or reuse a fresh) pairing code for the given user id. */
export async function createPairCode(userId: string): Promise<string> {
  const { db } = await import('@/lib/db');
  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  await db.user.update({
    where: { id: userId },
    data: {
      tgPairCode: code,
      tgPairCodeExpiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });
  return code;
}

/**
 * Try to bind `/start <code>` input to a user. Returns the user's name when
 * bound, null when the code is unknown/expired.
 */
export async function bindPairCode(
  code: string,
  chatId: string,
  username?: string,
): Promise<{ name: string; email: string } | null> {
  const { db } = await import('@/lib/db');
  const user = await db.user.findFirst({
    where: {
      tgPairCode: code,
      tgPairCodeExpiresAt: { gt: new Date() },
    },
  });
  if (!user) return null;
  await db.user.update({
    where: { id: user.id },
    data: {
      tgChatId: chatId,
      tgUsername: username ?? null,
      tgPairedAt: new Date(),
      tgPairCode: null,
      tgPairCodeExpiresAt: null,
    },
  });
  return { name: user.name, email: user.email };
}

/** Message text for a new interest lead. */
export function interestMessage(opts: {
  listing: { title: string; deal: string; priceUsd: number; districtName: string };
  interest: { name: string; phone: string; message?: string };
}): string {
  const { listing, interest } = opts;
  const kind = listing.deal === 'rent' ? 'rent' : 'buy';
  const lines = [
    `🔔 New interested contact for your ad on DealRadar:`,
    ``,
    `🏠 ${listing.title}`,
    `💰 $${Math.round(listing.priceUsd).toLocaleString('en-US')}${listing.deal === 'rent' ? '/mo' : ''} · ${listing.districtName} · for ${kind}`,
    ``,
    `👤 ${interest.name}`,
    `📞 ${interest.phone}`,
  ];
  if (interest.message) lines.push(`💬 ${interest.message}`);
  return lines.join('\n');
}

/** Send an interest notification to the owner. True on Telegram success. */
export async function notifyOwner(opts: {
  chatId: string;
  listing: { title: string; deal: string; priceUsd: number; districtName: string };
  interest: { name: string; phone: string; message?: string };
  interestId: string;
}): Promise<boolean> {
  const res = await tgApi('sendMessage', {
    chat_id: opts.chatId,
    text: interestMessage(opts),
    disable_web_page_preview: true,
  });
  return res.ok;
}

/** Send an arbitrary text message (used by the webhook for rejects). */
export async function sendRawMessage(chatId: string, text: string): Promise<void> {
  await tgApi('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
}

/** Confirm pairing in the chat. */
export async function sendPairConfirmation(chatId: string, name: string): Promise<void> {
  await tgApi('sendMessage', {
    chat_id: chatId,
    text: `✅ Paired! Hi ${name} — you will now get a notification here whenever someone is interested in your local ads on DealRadar.`,
  });
}

/** Verify the webhook secret header (webhook mode). */
export function webhookAuthorized(request: Request): boolean {
  if (!WEBHOOK_SECRET()) return false; // webhook mode disabled unless secret set
  return request.headers.get('x-telegram-bot-api-secret-token') === WEBHOOK_SECRET();
}
