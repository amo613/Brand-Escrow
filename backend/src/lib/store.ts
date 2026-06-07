/** Optional Redis persistence for the deal store. Write-through: the server keeps the
 *  in-memory Map as the read path; on boot we hydrate it from Redis, and every mutation is
 *  mirrored to Redis so deals survive a restart. With no REDIS_URL it's a pure no-op (local/tests). */
import Redis from 'ioredis'

const url = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || process.env.REDIS_PUBLIC_URL
export const redis = url ? new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true }) : null
const DEALS_KEY = 'pactpay:deals'

if (redis) {
  redis.on('error', (e) => console.warn('[redis] error:', e.message))
  redis.on('connect', () => console.log('[redis] connected'))
}

/** load all persisted deals on boot (returns [] if Redis is absent/unreachable) */
export async function loadDeals<T>(): Promise<T[]> {
  if (!redis) return []
  try {
    const h = await redis.hgetall(DEALS_KEY)
    return Object.values(h).map((v) => JSON.parse(v) as T)
  } catch (e) {
    console.warn('[redis] loadDeals failed:', (e as Error).message)
    return []
  }
}

/** mirror a single deal to Redis (fire-and-forget; never blocks the request path) */
export function persistDeal(id: string, meta: unknown): void {
  if (!redis) return
  redis.hset(DEALS_KEY, id, JSON.stringify(meta)).catch((e) => console.warn('[redis] persistDeal failed:', e.message))
}

export async function redisPing(): Promise<boolean> {
  if (!redis) return false
  try { await redis.ping(); return true } catch { return false }
}
