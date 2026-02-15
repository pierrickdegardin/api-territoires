import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configuration pool: 10 connexions max, timeout 30s
const baseUrl = process.env.DATABASE_URL || ''
const poolParams = 'connection_limit=10&pool_timeout=30'
const DATABASE_URL = baseUrl.includes('?') ? `${baseUrl}&${poolParams}` : `${baseUrl}?${poolParams}`

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: DATABASE_URL },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
