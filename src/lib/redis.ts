import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) return null // Stop retrying after 3 attempts
      return Math.min(times * 100, 3000)
    },
    lazyConnect: true,
  })

  client.on('error', (err) => {
    console.error('Redis connection error:', err.message)
  })

  return client
}

export const redis = globalForRedis.redis ?? createRedisClient()

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await redis.ping()
    return result === 'PONG'
  } catch {
    return false
  }
}

export async function isRedisConnected(): Promise<boolean> {
  return redis.status === 'ready'
}
