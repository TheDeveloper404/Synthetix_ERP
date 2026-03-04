/**
 * Redis client — Azure Cache for Redis (production) / local Redis (dev)
 *
 * Provides:
 *   - Sliding-window rate limiting (replaces MongoDB-based rate limiter)
 *   - JWT blacklist for server-side logout
 *
 * Falls back gracefully when REDIS_URL is not configured (dev without Redis).
 * In that case callers receive `null` from getRedisClient() and must fall back
 * to the MongoDB-based implementation.
 */

import Redis from 'ioredis'

let client = null
let connectionFailed = false

export function getRedisClient() {
  if (connectionFailed) return null
  if (client) return client

  const url = process.env.REDIS_URL
  if (!url) return null

  try {
    client = new Redis(url, {
      // Azure Cache for Redis requires TLS on port 6380
      tls: url.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      lazyConnect: false,
      enableReadyCheck: true,
    })

    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
      connectionFailed = true
      client = null
    })

    client.on('ready', () => {
      connectionFailed = false
      console.log('[Redis] Connected')
    })

    return client
  } catch (err) {
    console.error('[Redis] Failed to create client:', err.message)
    connectionFailed = true
    return null
  }
}

// ============= SLIDING WINDOW RATE LIMITER =============
/**
 * Returns { allowed: boolean, count: number, limit: number }
 * Uses a sorted set keyed by `key`, scored by timestamp (ms).
 * Falls back to returning { allowed: false } on any error (fail-closed).
 */
export async function redisRateLimit(key, maxRequests, windowSeconds) {
  const redis = getRedisClient()
  if (!redis) return null // Signal caller to fall back to MongoDB

  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const windowStart = now - windowMs
  const redisKey = `rl:${key}`

  try {
    const pipeline = redis.pipeline()
    // Remove entries older than the window
    pipeline.zremrangebyscore(redisKey, '-inf', windowStart)
    // Add current request
    pipeline.zadd(redisKey, now, `${now}-${Math.random()}`)
    // Count requests in window
    pipeline.zcard(redisKey)
    // Expire the key after the window (cleanup)
    pipeline.expire(redisKey, windowSeconds + 1)

    const results = await pipeline.exec()
    const count = results[2][1] // zcard result

    return {
      allowed: count <= maxRequests,
      count,
      limit: maxRequests,
    }
  } catch (err) {
    console.error('[Redis] Rate limit error:', err.message)
    return { allowed: false, count: 0, limit: maxRequests } // Fail-closed
  }
}

// ============= JWT BLACKLIST =============
/**
 * Add a JWT ID (jti) to the blacklist with TTL matching token expiry.
 * ttlSeconds: remaining lifetime of the token in seconds.
 */
export async function blacklistToken(jti, ttlSeconds) {
  const redis = getRedisClient()
  if (!redis) return false

  try {
    await redis.set(`jwt:bl:${jti}`, '1', 'EX', ttlSeconds)
    return true
  } catch (err) {
    console.error('[Redis] Blacklist write error:', err.message)
    return false
  }
}

/**
 * Returns true if the token's jti is blacklisted (i.e., logged out).
 */
export async function isTokenBlacklisted(jti) {
  const redis = getRedisClient()
  if (!redis) return false // Can't check → treat as valid (fail-open intentionally for availability)

  try {
    const result = await redis.get(`jwt:bl:${jti}`)
    return result !== null
  } catch (err) {
    console.error('[Redis] Blacklist read error:', err.message)
    return false
  }
}
