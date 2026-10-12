/**
 * Query result caching with LRU eviction policy.
 * 
 * Purpose:
 * - Cache expensive database query results in memory
 * - Automatic eviction based on LRU policy
 * - TTL-based expiration
 * - Memory-bounded cache
 */
import { LRUCache } from 'lru-cache';

const queryCache = new LRUCache({
  max: 500, // Maximum number of items
  ttl: 1000 * 60, // 1 minute default TTL
  updateAgeOnGet: true,
  updateAgeOnHas: true,
  // Optional: size calculation for memory-based limits
  // maxSize: 50 * 1024 * 1024, // 50MB
  // sizeCalculation: (value) => JSON.stringify(value).length,
});

/**
 * Execute a query with caching.
 * 
 * @param {string} key - Cache key (should be deterministic for the query)
 * @param {() => Promise<any>} queryFn - Function that executes the query
 * @param {number} [ttl=60000] - Time to live in milliseconds
 * @returns {Promise<any>}
 */
export function cachedQuery(key, queryFn, ttl = 60000) {
  const cached = queryCache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  return queryFn().then(result => {
    queryCache.set(key, result, { ttl });
    return result;
  });
}

/**
 * Invalidate cached queries matching a pattern.
 * 
 * @param {string} pattern - String pattern to match against keys
 */
export function invalidateQueryCache(pattern) {
  for (const key of queryCache.keys()) {
    if (key.includes(pattern)) {
      queryCache.delete(key);
    }
  }
}

/**
 * Clear all cached queries.
 */
export function clearQueryCache() {
  queryCache.clear();
}

/**
 * Get cache statistics.
 * 
 * @returns {{ size: number, hits: number, misses: number }}
 */
export function queryCacheStats() {
  return {
    size: queryCache.size,
    calculatedSize: queryCache.calculatedSize || 0,
  };
}

/**
 * Delete a specific cached query.
 * 
 * @param {string} key - Cache key to delete
 */
export function deleteCachedQuery(key) {
  queryCache.delete(key);
}
