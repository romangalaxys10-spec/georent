/**
 * /api/alerts — CRUD for price-watcher alerts (server-side route handler).
 *
 * GET    → alerts (createdAt desc) + matchCount per alert.
 *          matchCount = listings where lastSeenAt >= now-7d AND firstSeenAt >= alert.createdAt
 *          AND alert price/area/district/room filters match (SQL via Prisma where).
 * POST   → create alert (validated, min<=max cross-checked).
 * PATCH  → partial update by id (404 when missing, min<=max re-checked on merged values).
 * DELETE → ?id=… (404 when missing). NotificationRecord.alert FK is onDelete: SetNull
 *          in prisma/schema.prisma, so no manual notification cleanup is required.
 */
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import type { Alert } from '@prisma/client'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const districtIdsSchema = z.array(z.number().int())
const roomCountsSchema = z.array(z.number().int().min(1).max(8))

const alertCreateSchema = z.object({
  name: z.string().min(1).max(80),
  minPrice: z.number().int().positive().optional(),
  maxPrice: z.number().int().positive().optional(),
  cityId: z.number().int().positive(),
  districtIds: districtIdsSchema.optional(),
  roomCounts: roomCountsSchema.optional(),
  minArea: z.number().positive().optional(),
  maxArea: z.number().positive().optional(),
})

const alertUpdateSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(80).optional(),
  minPrice: z.number().int().positive().optional(),
  maxPrice: z.number().int().positive().optional(),
  districtIds: districtIdsSchema.optional(),
  roomCounts: roomCountsSchema.optional(),
  minArea: z.number().positive().optional(),
  maxArea: z.number().positive().optional(),
  active: z.boolean().optional(),
})

function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.join('.')
      return path.length > 0 ? `${path}: ${i.message}` : i.message
    })
    .join('; ')
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** Parse a JSON string expected to hold an array of numbers. Empty/invalid → []. */
function parseJsonInts(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  } catch {
    return []
  }
}

/**
 * SQL-matchable listing filter for one alert. Active listings seen in the last
 * 7 days that appeared (firstSeenAt) no earlier than the alert's creation.
 */
function listingWhereForAlert(alert: Alert, seenSince: Date): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    cityId: alert.cityId,
    lastSeenAt: { gte: seenSince },
    firstSeenAt: { gte: alert.createdAt },
  }

  if (alert.minPrice != null || alert.maxPrice != null) {
    const price: Prisma.FloatFilter = {}
    if (alert.minPrice != null) price.gte = alert.minPrice
    if (alert.maxPrice != null) price.lte = alert.maxPrice
    where.price = price
  }
  if (alert.minArea != null || alert.maxArea != null) {
    const area: Prisma.FloatFilter = {}
    if (alert.minArea != null) area.gte = alert.minArea
    if (alert.maxArea != null) area.lte = alert.maxArea
    where.area = area
  }

  const districtIds = parseJsonInts(alert.districtIds)
  if (districtIds.length > 0) where.districtId = { in: districtIds }

  const roomCounts = parseJsonInts(alert.roomCounts)
  if (roomCounts.length > 0) where.roomCount = { in: roomCounts }

  return where
}

export async function GET() {
  try {
    const seenSince = new Date(Date.now() - SEVEN_DAYS_MS)
    const alerts = await db.alert.findMany({ orderBy: { createdAt: 'desc' } })
    const withCounts = await Promise.all(
      alerts.map(async (alert) => {
        const matchCount = await db.listing.count({
          where: listingWhereForAlert(alert, seenSince),
        })
        return { ...alert, matchCount }
      }),
    )
    return NextResponse.json(withCounts)
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
    const parsed = alertCreateSchema.safeParse(body)
    if (!parsed.success) return badRequest(zodMessage(parsed.error))
    const b = parsed.data

    if (b.minPrice != null && b.maxPrice != null && b.minPrice > b.maxPrice) {
      return badRequest('minPrice must be <= maxPrice')
    }
    if (b.minArea != null && b.maxArea != null && b.minArea > b.maxArea) {
      return badRequest('minArea must be <= maxArea')
    }

    const alert = await db.alert.create({
      data: {
        name: b.name,
        minPrice: b.minPrice ?? null,
        maxPrice: b.maxPrice ?? null,
        cityId: b.cityId,
        districtIds: JSON.stringify(b.districtIds ?? []),
        roomCounts: JSON.stringify(b.roomCounts ?? []),
        minArea: b.minArea ?? null,
        maxArea: b.maxArea ?? null,
      },
    })
    return NextResponse.json(alert, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null)
    const parsed = alertUpdateSchema.safeParse(body)
    if (!parsed.success) return badRequest(zodMessage(parsed.error))
    const b = parsed.data

    const existing = await db.alert.findUnique({ where: { id: b.id } })
    if (!existing) {
      return NextResponse.json({ error: 'alert not found' }, { status: 404 })
    }

    // Validate min<=max against the merged (existing + patch) values.
    const minPrice = b.minPrice !== undefined ? b.minPrice : existing.minPrice
    const maxPrice = b.maxPrice !== undefined ? b.maxPrice : existing.maxPrice
    if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
      return badRequest('minPrice must be <= maxPrice')
    }
    const minArea = b.minArea !== undefined ? b.minArea : existing.minArea
    const maxArea = b.maxArea !== undefined ? b.maxArea : existing.maxArea
    if (minArea != null && maxArea != null && minArea > maxArea) {
      return badRequest('minArea must be <= maxArea')
    }

    const data: Prisma.AlertUpdateInput = {}
    if (b.name !== undefined) data.name = b.name
    if (b.minPrice !== undefined) data.minPrice = b.minPrice
    if (b.maxPrice !== undefined) data.maxPrice = b.maxPrice
    if (b.districtIds !== undefined) data.districtIds = JSON.stringify(b.districtIds)
    if (b.roomCounts !== undefined) data.roomCounts = JSON.stringify(b.roomCounts)
    if (b.minArea !== undefined) data.minArea = b.minArea
    if (b.maxArea !== undefined) data.maxArea = b.maxArea
    if (b.active !== undefined) data.active = b.active

    const alert = await db.alert.update({ where: { id: b.id }, data })
    return NextResponse.json(alert)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return badRequest('query param id is required')

    try {
      await db.alert.delete({ where: { id } })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025' // record not found
      ) {
        return NextResponse.json({ error: 'alert not found' }, { status: 404 })
      }
      throw err
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    )
  }
}
