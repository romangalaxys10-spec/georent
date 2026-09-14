/**
 * /api/notifications — in-app notification feed (server-side route handler).
 *
 * GET  → {notifications: latest 50 (createdAt desc), unreadCount}.
 * POST → {action:'read_all'} marks every unread row read; {action:'read', id}
 *        marks one row read (404 when the id is unknown). Either way the
 *        response is {ok:true, unreadCount}.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read_all') }),
  z.object({ action: z.literal('read'), id: z.string().min(1) }),
])

async function unreadCount(): Promise<number> {
  return db.notificationRecord.count({ where: { readAt: null } })
}

export async function GET() {
  try {
    const [notifications, unread] = await Promise.all([
      db.notificationRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        // Enrich each row with what the feed renders: the alert it matched,
        // and the listing's card link/thumbnail/location.
        include: {
          alert: { select: { name: true } },
          listing: {
            select: { link: true, image: true, districtName: true, address: true },
          },
        },
      }),
      unreadCount(),
    ])
    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        alertId: n.alertId,
        objectId: n.objectId,
        kind: n.kind,
        price: n.price,
        previousPrice: n.previousPrice,
        title: n.title,
        createdAt: n.createdAt,
        readAt: n.readAt,
        alertName: n.alert?.name ?? null,
        link: n.listing?.link ?? null,
        image: n.listing?.image ?? null,
        districtName: n.listing?.districtName ?? null,
        address: n.listing?.address ?? null,
      })),
      unreadCount: unread,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null)
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      return NextResponse.json({ error: `invalid body: ${msg}` }, { status: 400 })
    }

    if (parsed.data.action === 'read_all') {
      await db.notificationRecord.updateMany({
        where: { readAt: null },
        data: { readAt: new Date() },
      })
    } else {
      const updated = await db.notificationRecord.update({
        where: { id: parsed.data.id },
        data: { readAt: new Date() },
      })
      if (!updated) {
        return NextResponse.json({ error: 'notification not found' }, { status: 404 })
      }
    }

    return NextResponse.json({ ok: true, unreadCount: await unreadCount() })
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2025' // record not found
    ) {
      return NextResponse.json({ error: 'notification not found' }, { status: 404 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    )
  }
}
