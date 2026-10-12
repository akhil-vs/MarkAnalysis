/**
 * Performance monitoring and profiling utilities.
 * 
 * Tracks slow requests, database queries, and memory usage.
 */
import { pool } from '../prisma/db.js';

// Thresholds for logging (milliseconds)
const SLOW_REQUEST_THRESHOLD = 1000; // 1 second
const SLOW_QUERY_THRESHOLD = 100; // 100ms
const VERY_SLOW_QUERY_THRESHOLD = 500; // 500ms

// Request performance tracking
const requestStats = {
  total: 0,
  slow: 0,
  failed: 0,
  totalDuration: 0,
};

/**
 * Middleware to track request performance.
 */
export function performanceMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  
  // Track request completion
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e6; // Convert to ms
    
    requestStats.total++;
    requestStats.totalDuration += duration;
    
    if (res.statusCode >= 500) {
      requestStats.failed++;
    }
    
    if (duration > SLOW_REQUEST_THRESHOLD) {
      requestStats.slow++;
      console.warn('Slow request detected:', {
        method: req.method,
        path: req.path,
        duration: `${duration.toFixed(2)}ms`,
        status: res.statusCode,
        user: req.user?.userId || 'anonymous',
        tenant: req.user?.tenantId || 'none',
      });
    }
  });
  
  next();
}

/**
 * Get request performance statistics.
 */
export function getRequestStats() {
  return {
    ...requestStats,
    averageDuration: requestStats.total > 0 
      ? (requestStats.totalDuration / requestStats.total).toFixed(2) 
      : 0,
  };
}

/**
 * Reset request statistics.
 */
export function resetRequestStats() {
  requestStats.total = 0;
  requestStats.slow = 0;
  requestStats.failed = 0;
  requestStats.totalDuration = 0;
}

/**
 * Log slow database query.
 * 
 * @param {string} query - SQL query
 * @param {number} duration - Duration in milliseconds
 * @param {string} [params] - Query parameters
 */
export function logSlowQuery(query, duration, params = '') {
  if (duration > VERY_SLOW_QUERY_THRESHOLD) {
    console.error('Very slow query detected:', {
      duration: `${duration}ms`,
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      params: params ? String(params).substring(0, 100) : '',
    });
  } else if (duration > SLOW_QUERY_THRESHOLD) {
    console.warn('Slow query detected:', {
      duration: `${duration}ms`,
      query: query.substring(0, 150) + (query.length > 150 ? '...' : ''),
    });
  }
}

/**
 * Get database pool statistics.
 */
export async function getDatabaseStats() {
  if (!pool) {
    return { available: false };
  }

  return {
    available: true,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Get memory usage statistics.
 */
export function getMemoryStats() {
  const usage = process.memoryUsage();
  return {
    rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
  };
}

/**
 * Measure and log execution time of an async function.
 * 
 * @param {string} label - Description of the operation
 * @param {() => Promise<any>} fn - Function to measure
 * @returns {Promise<any>}
 */
export async function measureAsync(label, fn) {
  const start = process.hrtime.bigint();
  try {
    return await fn();
  } finally {
    const duration = Number(process.hrtime.bigint() - start) / 1e6;
    if (duration > SLOW_REQUEST_THRESHOLD) {
      console.warn(`Slow operation: ${label}`, `${duration.toFixed(2)}ms`);
    }
  }
}

/**
 * Get comprehensive performance statistics.
 */
export async function getPerformanceStats() {
  return {
    requests: getRequestStats(),
    database: await getDatabaseStats(),
    memory: getMemoryStats(),
    uptime: `${(process.uptime() / 60).toFixed(2)} minutes`,
  };
}
