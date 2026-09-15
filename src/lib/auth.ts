/**
 * Token auth for local ads — zero-dependency (node:crypto only).
 *
 * - Passwords: scrypt with per-user random salt, stored "salt:hex".
 * - API token: 48-hex random; only its SHA-256 is persisted, so a DB leak
 *   never leaks usable tokens. The raw token is shown once at signup and
 *   again on demand from the account panel (it is the user's credential).
 *
 * Client stores the token in localStorage and sends `Authorization: Bearer`.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from '@/lib/db';

const TOKEN_BYTES = 24; // → 48 hex chars
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  tgPaired: boolean;
  tgUsername?: string;
};

export function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([0-9a-f]{32,128})$/i.exec(header);
  return match ? match[1].toLowerCase() : null;
}

/** Resolve the authenticated user from the request, or null. */
export async function authUser(request: Request): Promise<AuthUser | null> {
  const token = bearer(request);
  if (!token) return null;
  const user = await db.user.findUnique({ where: { apiTokenHash: hashToken(token) } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tgPaired: Boolean(user.tgChatId),
    tgUsername: user.tgUsername ?? undefined,
  };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCredentials(email: string, password: string, name: string): string | null {
  if (!EMAIL_RE.test(email)) return 'invalid email';
  if (password.length < 8) return 'password must be at least 8 characters';
  if (name.trim().length < 2) return 'name must be at least 2 characters';
  return null;
}
