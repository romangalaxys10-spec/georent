/**
 * POST /api/auth/signup — create an account, return the login token ONCE.
 * Body: { email, password, name }
 * 200 → { token, user } | 409 email taken | 400 validation
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  generateToken,
  hashPassword,
  hashToken,
  validateCredentials,
} from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      password?: string;
      name?: string;
    } | null;
    const email = (body?.email ?? '').trim().toLowerCase();
    const password = body?.password ?? '';
    const name = (body?.name ?? '').trim();

    const invalid = validateCredentials(email, password, name);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const exists = await db.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: 'email already registered' }, { status: 409 });
    }

    const rawToken = generateToken();
    const user = await db.user.create({
      data: {
        email,
        name,
        passwordHash: hashPassword(password),
        apiTokenHash: hashToken(rawToken),
      },
    });

    return NextResponse.json({
      token: rawToken,
      user: { id: user.id, email: user.email, name: user.name, tgPaired: false },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
