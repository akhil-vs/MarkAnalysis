/**
 * Performance and health monitoring endpoint.
 * Provides detailed metrics for debugging and optimization.
 */
import { Router } from "express";
import { getPerformanceStats } from "../lib/performance.js";
import { queryCacheStats } from "../lib/queryCache.js";
import { tenantCacheSize } from "../lib/tenantCache.js";
import { isRedisAvailable, getCacheStats } from "../lib/redisCache.js";
import { checkMaterializedViewsHealth } from "../lib/materializedViews.js";
import { auth, requireRole } from "../middleware/auth.js";

export const monitoringRouter = Router();

// Monitoring endpoints require platform admin access
monitoringRouter.use(auth);
monitoringRouter.use(requireRole("PLATFORM_ADMIN"));

/**
 * GET /api/monitoring/performance
 * Get comprehensive performance statistics.
 */
monitoringRouter.get("/performance", async (req, res) => {
  try {
    const stats = await getPerformanceStats();
    
    res.json({
      ...stats,
      caches: {
        query: queryCacheStats(),
        tenant: { size: tenantCacheSize() },
        redis: {
          available: isRedisAvailable(),
          stats: isRedisAvailable() ? await getCacheStats() : null,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ 
      error: "Failed to get performance stats",
      message: err.message 
    });
  }
});

/**
 * GET /api/monitoring/health
 * Deep health check including database, caches, and materialized views.
 */
monitoringRouter.get("/health", async (req, res) => {
  try {
    const [materializedViews] = await Promise.all([
      checkMaterializedViewsHealth(),
    ]);

    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          available: true,
          poolStats: (await getPerformanceStats()).database,
        },
        redis: {
          available: isRedisAvailable(),
          status: isRedisAvailable() ? "connected" : "not configured",
        },
        materializedViews: {
          available: materializedViews.available,
          populated: materializedViews.allPopulated || false,
          views: materializedViews.views || [],
        },
        memory: (await getPerformanceStats()).memory,
      },
    };

    const statusCode = health.checks.database.available ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    res.status(503).json({
      status: "unhealthy",
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/monitoring/cache/stats
 * Get detailed cache statistics.
 */
monitoringRouter.get("/cache/stats", async (req, res) => {
  try {
    const stats = {
      query: queryCacheStats(),
      tenant: { size: tenantCacheSize() },
      redis: {
        available: isRedisAvailable(),
        stats: isRedisAvailable() ? await getCacheStats() : null,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({
      error: "Failed to get cache stats",
      message: err.message,
    });
  }
});

/**
 * POST /api/monitoring/cache/clear
 * Clear all caches (use with caution).
 */
monitoringRouter.post("/cache/clear", async (req, res) => {
  try {
    const { clearQueryCache } = await import("../lib/queryCache.js");
    const { clearTenantCache } = await import("../lib/tenantCache.js");
    const { invalidateCache } = await import("../lib/redisCache.js");

    clearQueryCache();
    clearTenantCache();
    
    if (isRedisAvailable()) {
      await invalidateCache("*");
    }

    res.json({
      success: true,
      message: "All caches cleared",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to clear caches",
      message: err.message,
    });
  }
});
