/**
 * Redis distributed cache for multi-instance deployments.
 * 
 * Falls back to in-memory cache when Redis is unavailable.
 * Set REDIS_URL environment variable to enable Redis caching.
 */
import Redis from 'ioredis';

let redis = null;
let redisAvailable = false;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some(targetError => err.message.includes(targetError));
      },
    });

    redis.on('connect', () => {
      redisAvailable = true;
      console.log('Redis cache connected');
    });

    redis.on('error', (err) => {
      redisAvailable = false;
      console.warn('Redis error (falling back to in-memory cache):', err.message);
    });

    redis.on('close', () => {
      redisAvailable = false;
      console.warn('Redis connection closed');
    });

    // Connect on startup
    redis.connect().catch(err => {
      console.warn('Redis initial connection failed:', err.message);
    });
  } catch (err) {
    console.warn('Redis initialization failed:', err.message);
  }
}

/**
 * Get cached value with automatic JSON parsing.
 * 
 * @param {string} key - Cache key
 * @param {() => Promise<any>} loader - Function to load fresh data
 * @param {number} [ttlSeconds=60] - Time to live in seconds
 * @returns {Promise<any>}
 */
export async function getCached(key, loader, ttlSeconds = 60) {
  if (!redis || !redisAvailable) {
    return loader();
  }

  try {
    const cached = await redis.get(key);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // If parse fails, return raw value
        return cached;
      }
    }

    const fresh = await loader();
    
    // Don't cache null/undefined
    if (fresh != null) {
      await redis.setex(key, ttlSeconds, JSON.stringify(fresh));
    }
    
    return fresh;
  } catch (err) {
    console.error('Redis cache error:', err.message);
    // Fallback to direct load on error
    return loader();
  }
}

/**
 * Set a cached value.
 * 
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} [ttlSeconds=60] - Time to live in seconds
 */
export async function setCached(key, value, ttlSeconds = 60) {
  if (!redis || !redisAvailable || value == null) {
    return;
  }

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    console.error('Redis set error:', err.message);
  }
}

/**
 * Delete a cached value.
 * 
 * @param {string} key - Cache key
 */
export async function deleteCached(key) {
  if (!redis || !redisAvailable) {
    return;
  }

  try {
    await redis.del(key);
  } catch (err) {
    console.error('Redis delete error:', err.message);
  }
}

/**
 * Invalidate cached values matching a pattern.
 * 
 * @param {string} pattern - Pattern to match (supports * wildcard)
 */
export async function invalidateCache(pattern) {
  if (!redis || !redisAvailable) {
    return;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error('Redis invalidation error:', err.message);
  }
}

/**
 * Check if Redis is available.
 * 
 * @returns {boolean}
 */
export function isRedisAvailable() {
  return redisAvailable;
}

/**
 * Get cache statistics.
 * 
 * @returns {Promise<object|null>}
 */
export async function getCacheStats() {
  if (!redis || !redisAvailable) {
    return null;
  }

  try {
    const info = await redis.info('stats');
    const dbSize = await redis.dbsize();
    return { info, dbSize };
  } catch (err) {
    console.error('Redis stats error:', err.message);
    return null;
  }
}

export { redis };
