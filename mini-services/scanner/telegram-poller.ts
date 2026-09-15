/**
 * Telegram pairing poller (fallback delivery path).
 *
 * When no webhook is configured (default sandbox / self-hosted deploys),
 * this worker long-polls Telegram getUpdates every TG_POLL_INTERVAL_MS and:
 *   • binds `/start <pairCode>` messages → user.telegramChatId
 *   • confirms the pairing in the chat
 * Pairing codes are created by POST /api/telegram/pair (15 min TTL) and
 * consumed on first successful bind.
 *
 * Runs alongside the alert scanner inside the same :3030 service — it is
 * strictly interval-based and never blocks the scan cycle.
 */
import { bindPairCode, botConfigured, sendPairConfirmation } from '../../src/lib/telegram'

const POLL_INTERVAL_MS = 12_000
const TG_BASE = 'https://api.telegram.org'

// Webhook mode owns delivery when TELEGRAM_WEBHOOK_SECRET is set — Telegram
// refuses getUpdates with 409 while a webhook is registered, so the poller
// must stay out of the way (no log spam, no double processing).
const webhookMode = (): boolean => Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)

// The scanner runs with mini-services/scanner as cwd — bun auto-loads THAT
// dir's .env, so the root .env (where the bot token lives) is parsed once here.
if (!process.env.TELEGRAM_BOT_TOKEN) {
  try {
    const raw = await Bun.file(new URL('../../.env', import.meta.url)).text()
    for (const line of raw.split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch {
    /* no root .env — fine */
  }
}

let offset = 0

type TgUpdate = {
  update_id: number
  message?: {
    text?: string
    chat?: { id?: number | string }
    from?: { username?: string }
  }
}

async function getUpdates(): Promise<TgUpdate[]> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? ''
  const res = await fetch(`${TG_BASE}/bot${token}/getUpdates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ offset, timeout: 0, limit: 20 }),
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await res.json()) as { ok: boolean; result?: TgUpdate[] }
  return json.ok && Array.isArray(json.result) ? json.result : []
}

/** One poll pass: process pending /start codes. */
export async function telegramPollOnce(): Promise<number> {
  if (!botConfigured() || webhookMode()) return 0
  try {
    const updates = await getUpdates()
    let bound = 0
    for (const u of updates) {
      offset = Math.max(offset, u.update_id + 1)
      const text = u.message?.text ?? ''
      const chatId = u.message?.chat?.id
      if (chatId === undefined) continue
      const match = /^\/start\s+(\d{6})\s*$/.exec(text)
      if (!match) continue
      const user = await bindPairCode(match[1], String(chatId), u.message?.from?.username)
      if (user) {
        await sendPairConfirmation(String(chatId), user.name)
        bound++
        console.log('[tg-poller] paired chat', chatId, '→', user.email)
      }
    }
    return bound
  } catch (err) {
    console.error('[tg-poller] poll failed:', err instanceof Error ? err.message : err)
    return 0
  }
}

/** Start the interval loop (idempotent across bun --hot reloads). */
export function startTelegramPoller(): void {
  const g = globalThis as unknown as { __tgPollerTimer?: ReturnType<typeof setInterval> }
  if (!botConfigured()) {
    console.log('[tg-poller] TELEGRAM_BOT_TOKEN not set — pairing via webhook or dashboard-only')
    return
  }
  if (webhookMode()) {
    console.log('[tg-poller] webhook mode active — getUpdates polling disabled')
    return
  }
  if (g.__tgPollerTimer) clearInterval(g.__tgPollerTimer)
  g.__tgPollerTimer = setInterval(() => void telegramPollOnce(), POLL_INTERVAL_MS)
  console.log('[tg-poller] started, every', POLL_INTERVAL_MS, 'ms')
}
