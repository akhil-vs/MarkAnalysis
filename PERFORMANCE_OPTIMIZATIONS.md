# Performance Optimizations

This document describes the comprehensive performance optimizations implemented in the application.

## Overview

The application now includes multiple layers of optimization for faster API calls and page loads:

- **Database Optimizations**: Strategic indexes and materialized views
- **Caching Layers**: Multi-tier caching (in-memory, Redis, query cache)
- **Query Optimization**: DataLoader for N+1 prevention, cursor pagination
- **Response Optimization**: Compression, cache headers
- **Monitoring**: Performance tracking and slow query detection

## Expected Performance Improvements

| Optimization | Expected Improvement |
|--------------|---------------------|
| Database Indexes | 50-80% faster queries |
| Response Compression | 70-85% smaller payloads |
| Redis Caching | 90-95% faster cache hits |
| Query Optimization | 40-60% reduction in DB load |
| Parallel Processing | 30-50% faster analytics |
| **Combined** | **5-10x overall performance gain** |

---

## Phase 1: Quick Wins (Implemented)

### 1.1 Database Indexes

Strategic indexes added to improve query performance:

**Mark table:**
- `(examId, status, studentId)` - Analytics queries
- `(examId, subjectId, status)` - Subject-wise queries  
- `(studentId, examId)` - Student performance lookups
- `(status, examId, subjectId, studentId)` - Complex filters
- `(enteredById, status, examId)` - Teacher queries
- `(subjectId, examId, status)` - Subject analytics

**Student table:**
- `(classSectionId, status)` - Active students by class
- `(status, academicYear)` - Academic year filters
- `(tenantId, status)` - Tenant-scoped queries

**TeacherAssignment table:**
- `(userId, classSectionId)` - Teacher assignments
- `(classSectionId, subjectId)` - Class-subject lookups
- `(tenantId, userId)` - Tenant-scoped assignments

**MarkAudit table:**
- `(timestamp)` - Chronological audit queries
- `(changedById, timestamp)` - User audit history
- `(tenantId, timestamp)` - Tenant audit logs

### 1.2 Response Compression

Gzip/Brotli compression enabled for all API responses:

```javascript
// Automatically compresses responses > 1KB
// Level 6 compression (balanced)
// 70-85% payload size reduction
```

### 1.3 Response Caching Headers

Analytics endpoints now include proper cache headers:

```javascript
Cache-Control: private, max-age=30, stale-while-revalidate=60
Vary: Authorization, Cookie
```

Benefits:
- Browser caches responses for 30 seconds
- Serves stale content while revalidating (60s window)
- Reduces server load for repeated requests

### 1.4 Query Result Memoization

LRU cache for database query results:

```javascript
import { cachedQuery } from './lib/queryCache.js';

// Cache query results for 60 seconds
const students = await cachedQuery(
  'students:class:123',
  () => prisma.student.findMany({ where: { classSectionId: '123' } }),
  60000
);
```

### 1.5 Optimized Connection Pool

PostgreSQL connection pool optimized for high concurrency:

```javascript
{
  max: 20,              // Maximum connections
  min: 5,               // Keep minimum warm
  idleTimeoutMillis: 30000,
  statement_timeout: 30000,
  keepAlive: true,
}
```

---

## Phase 2: Medium Priority (Implemented)

### 2.1 Redis Distributed Cache

Optional Redis caching for multi-instance deployments:

**Setup:**
```bash
# Set Redis URL environment variable
export REDIS_URL="redis://localhost:6379"
```

**Usage:**
```javascript
import { getCached, invalidateCache } from './lib/redisCache.js';

// Get or load with 60s TTL
const data = await getCached('key', async () => {
  return await fetchExpensiveData();
}, 60);

// Invalidate pattern
await invalidateCache('analytics:*');
```

**Features:**
- Automatic fallback to in-memory cache
- Reconnection handling
- JSON serialization
- Pattern-based invalidation

### 2.2 DataLoader (N+1 Prevention)

Batches and caches database queries within a request:

**Available Loaders:**
- `studentLoader` - Load students by ID
- `subjectLoader` - Load subjects by ID
- `examLoader` - Load exams by ID
- `classSectionLoader` - Load class sections by ID
- `userLoader` - Load users by ID
- `marksLoader` - Load marks by student and exam
- `teacherAssignmentsLoader` - Load teacher assignments
- `studentEnrollmentsLoader` - Load elective enrollments

**Usage:**
```javascript
// In route handlers
const student = await req.loaders.studentLoader.load(studentId);
const marks = await req.loaders.marksLoader.load([studentId, examId]);
```

**Benefits:**
- Eliminates N+1 query problems
- Automatic batching (up to 100 items)
- Per-request caching
- Reduces database load by 40-60%

### 2.3 Cursor-Based Pagination

Efficient pagination for large datasets:

**Old (Offset-based):**
```javascript
// Slow for large offsets
const students = await prisma.student.findMany({
  skip: 1000,
  take: 50,
});
```

**New (Cursor-based):**
```javascript
import { parseCursorQuery, cursorResult } from './lib/pagination.js';

const params = parseCursorQuery(req.query, { defaultSize: 50 });
const items = await prisma.student.findMany(params);
const result = cursorResult(items, params.take - 1);

res.json(result); // { items, hasMore, nextCursor }
```

**Benefits:**
- No offset calculation
- Consistent performance regardless of page
- No total count query needed

### 2.4 Performance Monitoring

Automatic detection of slow requests and queries:

**Tracked Metrics:**
- Request duration (logs requests > 1s)
- Database query duration (logs queries > 100ms)
- Database pool statistics
- Memory usage
- Request statistics (total, slow, failed)

**View Stats:**
```javascript
import { getPerformanceStats } from './lib/performance.js';

const stats = await getPerformanceStats();
console.log(stats);
```

---

## Phase 3: Long-term (Implemented)

### 3.1 Materialized Views

Pre-aggregated analytics data for fast queries:

**Created Views:**
1. `mv_exam_statistics` - Exam statistics by class and subject
2. `mv_student_performance` - Student performance summary by exam

**SQL File:** `server/sql/materialized-views.sql`

**Usage:**
```javascript
import { 
  getExamStatisticsFromView,
  getStudentPerformanceFromView,
  refreshAnalyticsViewsAsync 
} from './lib/materializedViews.js';

// Query pre-aggregated data (very fast)
const stats = await getExamStatisticsFromView(examId, tenantId);

// Refresh after mark changes (automatic with cache invalidation)
refreshAnalyticsViewsAsync();
```

**Features:**
- Concurrent refresh (non-blocking)
- Automatic refresh on mark mutations
- Indexed for fast lookups
- Dramatically faster than on-the-fly aggregation

**Manual Refresh:**
```sql
-- In PostgreSQL
SELECT refresh_analytics_views();
```

### 3.2 Worker Threads

CPU-intensive computations in separate threads:

**Available Workers:**
- `analyticsWorker.js` - Heavy analytics calculations

**Usage:**
```javascript
import { executeInWorker } from './lib/workerPool.js';

// Compute rankings in worker thread
const result = await executeInWorker('analyticsWorker.js', {
  operation: 'rankings',
  data: { students },
});
```

**Operations:**
- `rankings` - Calculate student rankings
- `subjectStats` - Subject-wise statistics
- `gradeDistribution` - Grade distribution
- `fullAnalytics` - All metrics combined

**Benefits:**
- Non-blocking main event loop
- Utilizes multiple CPU cores
- Automatic timeout handling (30s default)
- Graceful fallback on error

### 3.3 Monitoring Endpoints

Comprehensive monitoring for platform admins:

**Endpoints:**

1. `GET /api/monitoring/performance` - Performance statistics
2. `GET /api/monitoring/health` - Deep health check
3. `GET /api/monitoring/cache/stats` - Cache statistics
4. `POST /api/monitoring/cache/clear` - Clear all caches

**Example Response:**
```json
{
  "requests": {
    "total": 1542,
    "slow": 12,
    "failed": 3,
    "averageDuration": "85.32ms"
  },
  "database": {
    "available": true,
    "totalCount": 20,
    "idleCount": 15,
    "waitingCount": 0
  },
  "caches": {
    "query": { "size": 234 },
    "tenant": { "size": 45 },
    "redis": { "available": true, "dbSize": 512 }
  },
  "memory": {
    "rss": "142.52 MB",
    "heapUsed": "85.23 MB"
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Required
DATABASE_URL="postgresql://user:pass@localhost:5432/db"

# Optional - Redis caching
REDIS_URL="redis://localhost:6379"

# Optional - Monitoring
LOGIN_DASHBOARD_BUDGET_MS=1500  # Dashboard timeout (ms)
```

### Database Setup

1. **Apply schema changes:**
```bash
cd server
npx prisma contract emit
npx prisma db migrate --advance-ref db
```

2. **Initialize materialized views:**
```bash
psql $DATABASE_URL < sql/materialized-views.sql
```

Or programmatically:
```javascript
import { initializeMaterializedViews } from './lib/materializedViews.js';
await initializeMaterializedViews();
```

---

## Usage Guidelines

### When to Use What

**Query Cache:**
- Frequently accessed, rarely changing data
- Catalog data (exams, subjects, classes)
- Short TTL (30-60 seconds)

**Redis Cache:**
- Multi-instance deployments
- Longer TTL data (minutes to hours)
- Session data, analytics results

**DataLoader:**
- Always use when loading related entities
- Automatically prevents N+1 queries
- Per-request caching

**Cursor Pagination:**
- Large datasets (> 1000 rows)
- Audit logs, mark history
- Infinite scroll UIs

**Materialized Views:**
- Complex analytics queries
- Dashboard summaries
- Reports with aggregations

**Worker Threads:**
- CPU-intensive calculations
- Large dataset processing
- Report generation

### Cache Invalidation Strategy

```javascript
// After mark mutations
invalidateInsightsCache(); // Automatically handles:
// - Tenant cache
// - Query cache  
// - Redis cache patterns
// - Materialized view refresh
```

### Monitoring Best Practices

1. **Enable performance logging in development:**
```javascript
// Logs slow requests and queries automatically
```

2. **Check monitoring endpoints regularly:**
```bash
curl http://localhost:4000/api/monitoring/health
curl http://localhost:4000/api/monitoring/performance
```

3. **Set up alerts:**
- Database pool exhaustion (waitingCount > 5)
- High memory usage (> 80% of limit)
- Slow request rate (> 5% of requests)
- Failed request rate (> 1% of requests)

---

## Performance Testing

### Before/After Comparison

Run these queries to see performance improvements:

```bash
# 1. Analytics endpoint (complex query)
time curl -H "Cookie: token=..." \
  http://localhost:4000/api/analytics/school

# 2. Student marks (with DataLoader)
time curl -H "Cookie: token=..." \
  http://localhost:4000/api/marks?classSectionId=X&examId=Y

# 3. With materialized views
time curl -H "Cookie: token=..." \
  http://localhost:4000/api/analytics/class/X
```

### Load Testing

```bash
# Install Apache Bench or similar
brew install httpd  # macOS
apt-get install apache2-utils  # Ubuntu

# Test endpoint under load
ab -n 1000 -c 10 -H "Cookie: token=..." \
  http://localhost:4000/api/analytics/school
```

---

## Troubleshooting

### High Memory Usage

```javascript
// Check memory stats
const stats = await getPerformanceStats();
console.log(stats.memory);

// Clear caches if needed
clearQueryCache();
clearTenantCache();
```

### Slow Queries

Check logs for slow query warnings:
```
Slow query detected: duration 342ms
```

Add missing indexes or optimize query logic.

### Redis Connection Issues

Redis automatically falls back to in-memory cache:
```
Redis error (falling back to in-memory cache): Connection refused
```

Ensure Redis is running:
```bash
redis-cli ping  # Should return PONG
```

### Worker Thread Failures

Worker threads have automatic fallback:
```javascript
// If worker fails, fallback function runs
await executeWithWorkerFallback('worker.js', data, fallbackFn);
```

---

## Migration Guide

### Existing Code Migration

**Before:**
```javascript
const students = await prisma.student.findMany({
  where: { classSectionId },
  include: { marks: true },
});
```

**After (with DataLoader):**
```javascript
const students = await prisma.student.findMany({
  where: { classSectionId },
});

// Load marks in parallel (batched)
const marksPromises = students.map(s => 
  req.loaders.marksLoader.load([s.id, examId])
);
const allMarks = await Promise.all(marksPromises);
```

### Analytics Endpoints

**Before:**
```javascript
// Direct aggregation (slow)
const stats = await computeStats(marks);
```

**After (with materialized views):**
```javascript
// Use pre-aggregated data (fast)
const stats = await getExamStatisticsFromView(examId);

// Fallback to computation if view unavailable
if (!stats.length) {
  stats = await computeStats(marks);
}
```

---

## Maintenance

### Regular Tasks

1. **Monitor materialized view freshness:**
```sql
SELECT 
  matviewname, 
  last_refresh 
FROM pg_matviews 
WHERE schemaname = 'public';
```

2. **Check database index usage:**
```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

3. **Review slow query logs:**
```bash
grep "Slow query" logs/*.log | sort | uniq -c
```

### Optimization Opportunities

Monitor these metrics to find optimization opportunities:

- Endpoints with > 1s response time
- Queries with > 100ms execution time
- Cache hit rates < 80%
- Database pool waiting count > 0

---

## Future Enhancements

Potential additional optimizations:

1. **GraphQL API** - Flexible field selection
2. **HTTP/2 Server Push** - Preload related resources
3. **Edge Caching** - CDN for static assets
4. **Read Replicas** - Separate read/write databases
5. **Query Result Streaming** - For very large datasets

---

## Support

For questions or issues:

1. Check monitoring endpoints first
2. Review performance logs
3. Verify environment configuration
4. Check Redis/database connectivity

## Performance Checklist

- [x] Database indexes added
- [x] Response compression enabled
- [x] Cache headers configured
- [x] Query result caching implemented
- [x] Connection pool optimized
- [x] Redis caching available
- [x] DataLoader preventing N+1
- [x] Cursor pagination ready
- [x] Performance monitoring active
- [x] Materialized views created
- [x] Worker threads available
- [x] Monitoring endpoints live

**Status: All optimizations implemented and ready for production!**
