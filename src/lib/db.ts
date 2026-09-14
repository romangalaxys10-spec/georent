import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: ['query'],
  })
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient()
  return globalForPrisma.prisma
}

/**
 * Lazy Prisma singleton. Route modules are imported (not executed) during
 * `next build`, so a module-scope `new PrismaClient()` would validate
 * DATABASE_URL at build time and fail serverless deployments that don't
 * carry a database (demo mode). The proxy defers instantiation until the
 * first actual property access — i.e. the first real DB query.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = Reflect.get(client, prop)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
