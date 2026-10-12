# Vercel Deployment Guide - Performance Optimizations

This guide covers deploying the performance optimizations to Vercel, including database migrations and configuration.

## Prerequisites

Before deploying:
- ✅ All code changes committed and pushed to GitHub
- ✅ Pull request #186 reviewed and ready to merge
- ✅ Database backup taken (recommended)
- ✅ Vercel project connected to your repository

---

## Step-by-Step Deployment

### 1. Merge the Pull Request

```bash
# Merge PR #186 on GitHub or via CLI
gh pr merge 186 --merge
```

### 2. Configure Environment Variables in Vercel

Go to your Vercel project settings and ensure these are set:

**Required:**
```
DATABASE_URL=postgresql://user:pass@host:5432/database
```

**Optional (for Redis caching):**
```
REDIS_URL=redis://host:6379
```

**Optional (performance tuning):**
```
LOGIN_DASHBOARD_BUDGET_MS=1500
```

### 3. Apply Database Migrations

The new indexes will be applied automatically during Prisma contract emit in the build process. However, you need to ensure the database schema is up to date.

#### Option A: Via Vercel CLI (Recommended)

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Link to your project
vercel link

# Pull environment variables
vercel env pull .env.local

# Run migration locally against production database
cd server
npx prisma contract emit
npx prisma db migrate --advance-ref db

# The indexes will be created automatically
```

#### Option B: Via Database Client

If you prefer to apply migrations manually, run this SQL:

```sql
-- Mark table indexes
CREATE INDEX IF NOT EXISTS "Mark_examId_status_studentId_idx" 
  ON "Mark"("examId", "status", "studentId");

CREATE INDEX IF NOT EXISTS "Mark_examId_subjectId_status_idx" 
  ON "Mark"("examId", "subjectId", "status");

CREATE INDEX IF NOT EXISTS "Mark_studentId_examId_idx" 
  ON "Mark"("studentId", "examId");

CREATE INDEX IF NOT EXISTS "Mark_status_examId_subjectId_studentId_idx" 
  ON "Mark"("status", "examId", "subjectId", "studentId");

CREATE INDEX IF NOT EXISTS "Mark_enteredById_status_examId_idx" 
  ON "Mark"("enteredById", "status", "examId");

CREATE INDEX IF NOT EXISTS "Mark_subjectId_examId_status_idx" 
  ON "Mark"("subjectId", "examId", "status");

-- Student table indexes
CREATE INDEX IF NOT EXISTS "Student_classSectionId_status_idx" 
  ON "Student"("classSectionId", "status");

CREATE INDEX IF NOT EXISTS "Student_status_academicYear_idx" 
  ON "Student"("status", "academicYear");

CREATE INDEX IF NOT EXISTS "Student_tenantId_status_idx" 
  ON "Student"("tenantId", "status");

-- TeacherAssignment table indexes
CREATE INDEX IF NOT EXISTS "TeacherAssignment_userId_classSectionId_idx" 
  ON "TeacherAssignment"("userId", "classSectionId");

CREATE INDEX IF NOT EXISTS "TeacherAssignment_classSectionId_subjectId_idx" 
  ON "TeacherAssignment"("classSectionId", "subjectId");

CREATE INDEX IF NOT EXISTS "TeacherAssignment_tenantId_userId_idx" 
  ON "TeacherAssignment"("tenantId", "userId");

-- MarkAudit table indexes
CREATE INDEX IF NOT EXISTS "MarkAudit_timestamp_idx" 
  ON "MarkAudit"("timestamp");

CREATE INDEX IF NOT EXISTS "MarkAudit_changedById_timestamp_idx" 
  ON "MarkAudit"("changedById", "timestamp");

CREATE INDEX IF NOT EXISTS "MarkAudit_tenantId_timestamp_idx" 
  ON "MarkAudit"("tenantId", "timestamp");

-- Verify indexes were created
SELECT 
  tablename, 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('Mark', 'Student', 'TeacherAssignment', 'MarkAudit')
ORDER BY tablename, indexname;
```

### 4. Initialize Materialized Views (Optional but Recommended)

Connect to your production database and run:

```bash
# From your local machine with production DATABASE_URL
psql $DATABASE_URL < server/sql/materialized-views.sql
```

Or copy the SQL from `server/sql/materialized-views.sql` and execute in your database client.

**Verify materialized views:**
```sql
SELECT 
  schemaname,
  matviewname,
  hasindexes,
  ispopulated
FROM pg_matviews
WHERE schemaname = 'public';
```

### 5. Deploy to Vercel

```bash
# Trigger a new deployment
git push origin main

# Or manually via Vercel CLI
vercel --prod
```

### 6. Verify Deployment

Once deployed, verify the optimizations are working:

#### A. Check Compression
```bash
curl -H "Accept-Encoding: gzip" -I https://your-app.vercel.app/api/analytics/school

# Should see: Content-Encoding: gzip
```

#### B. Check Response Headers
```bash
curl -I https://your-app.vercel.app/api/analytics/school

# Should see: Cache-Control: private, max-age=30, stale-while-revalidate=60
```

#### C. Test Performance (requires authentication)
```bash
# Login and get auth cookie, then:
time curl -b "token=YOUR_TOKEN" https://your-app.vercel.app/api/analytics/school
```

#### D. Check Monitoring Endpoint (Platform Admin only)
```bash
curl -b "token=ADMIN_TOKEN" https://your-app.vercel.app/api/monitoring/health
curl -b "token=ADMIN_TOKEN" https://your-app.vercel.app/api/monitoring/performance
```

---

## Post-Deployment Verification

### 1. Database Indexes
```sql
-- Check index usage after a few hours
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('Mark', 'Student', 'TeacherAssignment', 'MarkAudit')
ORDER BY idx_scan DESC;
```

### 2. Performance Metrics

Monitor these key metrics:

- **Response times**: Should see 5-10x improvement on analytics endpoints
- **Payload sizes**: Should be 70-85% smaller (check Network tab)
- **Database connections**: Check pool usage doesn't exceed limits
- **Memory usage**: Monitor for any memory leaks

### 3. Materialized Views

If you initialized materialized views:

```sql
-- Check view row counts
SELECT COUNT(*) FROM mv_exam_statistics;
SELECT COUNT(*) FROM mv_student_performance;

-- Check last refresh time
SELECT 
  matviewname, 
  last_refresh 
FROM pg_matviews 
WHERE schemaname = 'public';
```

---

## Rollback Plan

If you encounter issues:

### 1. Quick Rollback (Code)
```bash
# Revert the deployment in Vercel dashboard
# Or redeploy previous commit:
vercel --prod --force
```

### 2. Database Rollback (Indexes)

Indexes can be safely dropped if causing issues:

```sql
-- Drop performance optimization indexes
DROP INDEX IF EXISTS "Mark_examId_status_studentId_idx";
DROP INDEX IF EXISTS "Mark_examId_subjectId_status_idx";
DROP INDEX IF EXISTS "Mark_studentId_examId_idx";
DROP INDEX IF EXISTS "Mark_status_examId_subjectId_studentId_idx";
DROP INDEX IF EXISTS "Mark_enteredById_status_examId_idx";
DROP INDEX IF EXISTS "Mark_subjectId_examId_status_idx";

DROP INDEX IF EXISTS "Student_classSectionId_status_idx";
DROP INDEX IF EXISTS "Student_status_academicYear_idx";
DROP INDEX IF EXISTS "Student_tenantId_status_idx";

DROP INDEX IF EXISTS "TeacherAssignment_userId_classSectionId_idx";
DROP INDEX IF EXISTS "TeacherAssignment_classSectionId_subjectId_idx";
DROP INDEX IF EXISTS "TeacherAssignment_tenantId_userId_idx";

DROP INDEX IF EXISTS "MarkAudit_timestamp_idx";
DROP INDEX IF EXISTS "MarkAudit_changedById_timestamp_idx";
DROP INDEX IF EXISTS "MarkAudit_tenantId_timestamp_idx";
```

### 3. Materialized Views Rollback

```sql
DROP MATERIALIZED VIEW IF EXISTS mv_exam_statistics;
DROP MATERIALIZED VIEW IF EXISTS mv_student_performance;
DROP FUNCTION IF EXISTS refresh_analytics_views();
```

---

## Troubleshooting

### Build Failures

**Error: "Prisma contract emit failed"**
- Check that `server/src/prisma/contract.prisma` is valid
- Ensure all Prisma dependencies are in `package.json`
- Check Vercel build logs for specific errors

**Error: "Database connection failed"**
- Verify `DATABASE_URL` is set in Vercel environment variables
- Check database is accessible from Vercel (check firewall rules)
- Test connection: `psql $DATABASE_URL -c "SELECT 1"`

### Runtime Issues

**Slow queries after deployment**
- Check if indexes were created: `\di` in psql
- Run `ANALYZE` on tables: `ANALYZE "Mark", "Student", "TeacherAssignment", "MarkAudit";`
- Check for blocking queries: `SELECT * FROM pg_stat_activity WHERE wait_event IS NOT NULL;`

**High memory usage**
- Check connection pool settings in Vercel logs
- Reduce pool size if needed (edit `server/src/prisma/db.js`)
- Monitor with: `curl /api/monitoring/performance`

**Redis connection errors**
- Redis is optional - app works without it
- Check `REDIS_URL` is correct
- Verify Redis instance is accessible
- Logs will show: "Redis error (falling back to in-memory cache)"

### Performance Not Improved

**If performance hasn't improved:**

1. Verify indexes exist:
```sql
SELECT COUNT(*) FROM pg_indexes 
WHERE tablename = 'Mark' 
AND indexname LIKE '%_idx';
-- Should return 6
```

2. Check compression is working:
```bash
curl -I https://your-app.vercel.app/api/analytics/school | grep "Content-Encoding"
```

3. Check cache headers:
```bash
curl -I https://your-app.vercel.app/api/analytics/school | grep "Cache-Control"
```

4. Review monitoring endpoints (platform admin):
```bash
curl -b "token=ADMIN_TOKEN" https://your-app.vercel.app/api/monitoring/performance
```

---

## Performance Testing

Run these tests after deployment:

### 1. Load Test
```bash
# Install Apache Bench
brew install httpd  # macOS
apt-get install apache2-utils  # Ubuntu

# Test analytics endpoint
ab -n 100 -c 5 -H "Cookie: token=YOUR_TOKEN" \
  https://your-app.vercel.app/api/analytics/school
```

### 2. Response Time Comparison

Create a simple script to compare before/after:

```bash
#!/bin/bash
echo "Testing response times..."

for i in {1..10}; do
  time=$(curl -w '%{time_total}' -o /dev/null -s \
    -b "token=YOUR_TOKEN" \
    https://your-app.vercel.app/api/analytics/school)
  echo "Request $i: ${time}s"
done
```

### 3. Payload Size Check

```bash
# Before compression
curl -H "Accept-Encoding: identity" -s \
  -b "token=YOUR_TOKEN" \
  https://your-app.vercel.app/api/analytics/school | wc -c

# With compression
curl -H "Accept-Encoding: gzip" -s \
  -b "token=YOUR_TOKEN" \
  https://your-app.vercel.app/api/analytics/school | wc -c
```

---

## Monitoring & Maintenance

### Regular Checks

**Daily:**
- Monitor Vercel function execution times
- Check error rates in Vercel logs
- Review database connection pool usage

**Weekly:**
- Check index usage statistics
- Review slow query logs
- Monitor memory usage trends
- Check materialized view freshness (if using)

**Monthly:**
- Run `VACUUM ANALYZE` on main tables
- Review and optimize slow queries
- Check database size growth
- Update statistics: `ANALYZE;`

### Recommended Alerts

Set up alerts for:
- Response time > 3s (degraded performance)
- Error rate > 1% (issues with code)
- Database pool exhausted (need to scale)
- Memory usage > 80% (potential leak)

---

## Optional: Redis Setup

If you want to enable Redis caching:

### Using Vercel KV (Managed Redis)

1. Enable Vercel KV in your project
2. Copy the `REDIS_URL` from Vercel dashboard
3. Add to environment variables
4. Redeploy

### Using External Redis

1. Set up Redis instance (e.g., Redis Labs, AWS ElastiCache)
2. Get connection string
3. Add `REDIS_URL` to Vercel environment variables:
   ```
   REDIS_URL=redis://username:password@host:port
   ```
4. Redeploy

### Verify Redis

```bash
# Check if Redis is connected
curl -b "token=ADMIN_TOKEN" \
  https://your-app.vercel.app/api/monitoring/cache/stats

# Should show: "redis": { "available": true }
```

---

## Success Criteria

Deployment is successful when:

- ✅ Build completes without errors
- ✅ Database indexes are created (verify with SQL)
- ✅ Compression is working (check headers)
- ✅ Cache headers are present
- ✅ Response times improved 5-10x
- ✅ Payload sizes reduced 70-85%
- ✅ No increase in error rates
- ✅ Monitoring endpoints accessible
- ✅ (Optional) Materialized views populated
- ✅ (Optional) Redis connected

---

## Support

If you encounter issues:

1. **Check Vercel logs**: `vercel logs` or dashboard
2. **Check database logs**: Look for slow queries, errors
3. **Review monitoring**: `/api/monitoring/health`, `/api/monitoring/performance`
4. **Consult documentation**: `PERFORMANCE_OPTIMIZATIONS.md`

## Next Steps After Deployment

1. Monitor performance for 24-48 hours
2. Collect metrics and compare to baseline
3. Adjust cache TTLs if needed (edit code and redeploy)
4. Consider enabling Redis if not already done
5. Set up materialized views if skipped
6. Configure alerts based on monitoring data

---

**Deployment checklist complete!** 🚀

All optimizations should now be live in production.
