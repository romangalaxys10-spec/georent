/**
 * POST /api/auth/login — email + password → { token, user }.
 * The token is re-shown here (hash lookup proves possession).
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateToken, hashPassword, hashToken, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      password?: string;
    } | null;
    const email = (body?.email ?? '').trim().toLowerCase();
    const password = body?.password ?? '';

    // scrypt is CPU-heavy: hash a dummy even when the user is missing so
    // response timing does not reveal which emails exist.
    const user = await db.user.findUnique({ where: { email } });
    const stored = user?.passwordHash ?? hashPassword('timing-equalizer');
    const ok = verifyPassword(password, stored);
    if (!user || !ok) {
      return NextResponse.json({ error: 'wrong email or password' }, { status: 401 });
    }

    // Rotate the token on each login — old tokens stop working immediately.
    const rawToken = generateToken();
    await db.user.update({
      where: { id: user.id },
      data: { apiTokenHash: hashToken(rawToken) },
    });

    return NextResponse.json({
      token: rawToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tgPaired: Boolean(user.tgChatId),
        tgUsername: user.tgUsername ?? undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
