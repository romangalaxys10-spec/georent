#!/usr/bin/env node
/**
 * One-command Telegram wiring for DealRadar (georent.space-z.ai).
 *
 * Usage:
 *   node scripts/telegram-setup.mjs <BOT_TOKEN> [--local] [--test-chat <id>] [--url <public-url>]
 *   (or provide the token via the TELEGRAM_BOT_TOKEN env var)
 *
 * What it does:
 *   1. Validates the token via getMe and captures the bot's @username.
 *   2. Writes .env idempotently:
 *        TELEGRAM_BOT_TOKEN       — the token
 *        TELEGRAM_BOT_USERNAME    — @username from getMe (drives t.me deep links)
 *        TELEGRAM_WEBHOOK_SECRET  — random hex, generated if missing (webhook mode)
 *   3. Registers the production webhook at <PUBLIC_URL>/api/telegram/webhook
 *      with the secret header Telegram echoes back on every update.
 *      With --local it does the opposite (deleteWebhook) so the :3030
 *      getUpdates poller owns delivery instead.
 *   4. Verifies with getWebhookInfo and optionally sends a test message.
 *
 * After running: restart the Next.js process (or let the platform redeploy)
 * so the app picks up the new env values.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const DEFAULT_PUBLIC_URL = 'https://georent.space-z.ai';

// --- argv parsing -----------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(name);

const token =
  args.find((a, i) => i === 0 && !a.startsWith('--')) ??
  flag('--token') ??
  process.env.TELEGRAM_BOT_TOKEN ??
  '';
const LOCAL = has('--local');
const TEST_CHAT = flag('--test-chat');
const PUBLIC_URL = (flag('--url') ?? DEFAULT_PUBLIC_URL).replace(/\/+$/, '');

if (!token || token.length < 20 || !/^\d+:[\w-]+$/.test(token)) {
  console.error('✖ Provide the bot token from @BotFather (format 123456789:AAF...):');
  console.error('    node scripts/telegram-setup.mjs "123456789:AAF..." [--local] [--test-chat <chatId>]');
  process.exit(1);
}

const tg = async (method, body = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return res.json();
};

// --- 1. validate token ------------------------------------------------------
const me = await tg('getMe');
if (!me?.ok) {
  console.error('✖ Token rejected by Telegram:', me?.description ?? 'unknown error');
  process.exit(1);
}
const username = me.result.username;
console.log(`✔ Token valid — bot @${username} (id ${me.result.id})`);

// --- 2. write .env idempotently ---------------------------------------------
let secret = '';
const envLines = readFileSync(ENV_PATH, 'utf8').split('\n');
const want = {
  TELEGRAM_BOT_TOKEN: token,
  TELEGRAM_BOT_USERNAME: username,
};
const secretLine = envLines.find((l) => /^TELEGRAM_WEBHOOK_SECRET=/.test(l));
if (secretLine && secretLine.split('=').slice(1).join('=').trim().length > 10) {
  secret = secretLine.split('=').slice(1).join('=').trim();
} else {
  secret = randomBytes(32).toString('hex');
  want.TELEGRAM_WEBHOOK_SECRET = secret;
}
let wrote = [];
const seen = new Set();
const out = envLines.map((line) => {
  const m = /^([A-Z0-9_]+)=/.exec(line);
  if (!m || !(m[1] in want)) return line;
  seen.add(m[1]);
  return `${m[1]}=${want[m[1]]}`;
});
for (const [k, v] of Object.entries(want)) {
  if (!seen.has(k)) out.push(`${k}=${v}`);
  wrote.push(k);
}
writeFileSync(ENV_PATH, out.join('\n'));
console.log(`✔ .env updated (${wrote.join(', ')})`);

// --- 3. webhook vs polling ---------------------------------------------------
if (LOCAL) {
  const del = await tg('deleteWebhook', { drop_pending_updates: false });
  console.log(del.ok
    ? '✔ Webhook deleted — polling mode: the :3030 scanner poller binds /start codes'
    : `✖ deleteWebhook failed: ${del.description}`);
} else {
  const hookUrl = `${PUBLIC_URL}/api/telegram/webhook`;
  const set = await tg('setWebhook', {
    url: hookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  });
  if (!set.ok) {
    console.error(`✖ setWebhook failed: ${set.description}`);
    console.error('  Fix the public URL (--url) or run with --local to use polling mode.');
    process.exit(1);
  }
  console.log(`✔ Webhook registered → ${hookUrl}`);
  const info = await tg('getWebhookInfo');
  if (info?.ok) {
    const r = info.result;
    console.log(`  pending_updates=${r.pending_update_count} last_error=${r.last_error_message ?? 'none'}`);
  }
}

// --- 4. optional test message -------------------------------------------------
if (TEST_CHAT) {
  const msg = await tg('sendMessage', {
    chat_id: TEST_CHAT,
    text: '✅ DealRadar Telegram delivery test — live notifications are working.',
  });
  console.log(msg.ok ? `✔ Test message delivered to chat ${TEST_CHAT}` : `✖ sendMessage failed: ${msg.description}`);
}

console.log('\nNext steps:');
console.log('  1. Restart the Next.js app (or let the platform redeploy) to load the new env.');
console.log('  2. Sign in → My Ads → Pair Telegram → tap the bot link → Start.');
console.log('  3. From another device tap "I\'m interested" on one of your ads — you get a ping here.');
