/**
 * Materialized view management utilities.
 * 
 * Provides functions to refresh and query pre-aggregated analytics data.
 * Materialized views dramatically speed up complex analytics queries.
 */
import { pool } from '../prisma/db.js';
import { getTenantId } from './tenant.js';

/**
 * Refresh all analytics materialized views concurrently.
 * Should be called after mark mutations.
 * 
 * @returns {Promise<void>}
 */
export async function refreshAnalyticsViews() {
  if (!pool) {
    console.warn('Database pool not available, skipping materialized view refresh');
    return;
  }

  try {
    await pool.query('SELECT refresh_analytics_views()');
  } catch (err) {
    console.error('Failed to refresh materialized views:', err.message);
    // Don't throw - view refresh failures shouldn't break the application
  }
}

/**
 * Refresh materialized views in the background (non-blocking).
 * Use this after mark mutations to keep views up-to-date.
 */
export function refreshAnalyticsViewsAsync() {
  refreshAnalyticsViews().catch(err => {
    console.error('Background view refresh failed:', err.message);
  });
}

/**
 * Get exam statistics from materialized view.
 * Much faster than computing on-the-fly.
 * 
 * @param {string} examId - Exam ID
 * @param {string} [tenantId] - Tenant ID (defaults to current tenant)
 * @returns {Promise<Array>}
 */
export async function getExamStatisticsFromView(examId, tenantId = null) {
  if (!pool) {
    return [];
  }

  const tenant = tenantId || getTenantId();
  if (!tenant) {
    throw new Error('Tenant ID required for exam statistics');
  }

  try {
    const result = await pool.query(
      `SELECT * FROM mv_exam_statistics 
       WHERE exam_id = $1 AND tenant_id = $2
       ORDER BY class_name, section, subject_name`,
      [examId, tenant]
    );
    return result.rows;
  } catch (err) {
    console.error('Failed to query exam statistics view:', err.message);
    return [];
  }
}

/**
 * Get student performance from materialized view.
 * 
 * @param {string} studentId - Student ID
 * @param {string} [examId] - Optional exam ID filter
 * @returns {Promise<Array>}
 */
export async function getStudentPerformanceFromView(studentId, examId = null) {
  if (!pool) {
    return [];
  }

  try {
    const query = examId
      ? `SELECT * FROM mv_student_performance 
         WHERE student_id = $1 AND exam_id = $2`
      : `SELECT * FROM mv_student_performance 
         WHERE student_id = $1
         ORDER BY exam_name`;
    
    const params = examId ? [studentId, examId] : [studentId];
    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('Failed to query student performance view:', err.message);
    return [];
  }
}

/**
 * Get class-wise statistics from materialized view.
 * 
 * @param {string} examId - Exam ID
 * @param {string} classSectionId - Class section ID
 * @param {string} [tenantId] - Tenant ID (defaults to current tenant)
 * @returns {Promise<Array>}
 */
export async function getClassStatisticsFromView(examId, classSectionId, tenantId = null) {
  if (!pool) {
    return [];
  }

  const tenant = tenantId || getTenantId();
  if (!tenant) {
    throw new Error('Tenant ID required for class statistics');
  }

  try {
    const result = await pool.query(
      `SELECT * FROM mv_exam_statistics 
       WHERE exam_id = $1 AND class_section_id = $2 AND tenant_id = $3
       ORDER BY subject_name`,
      [examId, classSectionId, tenant]
    );
    return result.rows;
  } catch (err) {
    console.error('Failed to query class statistics view:', err.message);
    return [];
  }
}

/**
 * Check if materialized views exist and are up to date.
 * 
 * @returns {Promise<object>}
 */
export async function checkMaterializedViewsHealth() {
  if (!pool) {
    return { available: false, reason: 'Database pool not available' };
  }

  try {
    const result = await pool.query(`
      SELECT 
        schemaname,
        matviewname,
        hasindexes,
        ispopulated
      FROM pg_matviews
      WHERE schemaname = 'public'
        AND matviewname IN ('mv_exam_statistics', 'mv_student_performance')
    `);

    return {
      available: result.rows.length === 2,
      views: result.rows,
      allPopulated: result.rows.every(v => v.ispopulated),
    };
  } catch (err) {
    return { 
      available: false, 
      error: err.message,
      reason: 'Failed to check materialized views' 
    };
  }
}

/**
 * Initialize materialized views (run on startup or migration).
 * 
 * @returns {Promise<boolean>}
 */
export async function initializeMaterializedViews() {
  if (!pool) {
    console.warn('Database pool not available, skipping materialized view initialization');
    return false;
  }

  try {
    const health = await checkMaterializedViewsHealth();
    
    if (!health.available) {
      console.log('Materialized views not found, creating...');
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const sqlPath = path.join(__dirname, '../../sql/materialized-views.sql');
      
      try {
        const sql = await fs.readFile(sqlPath, 'utf-8');
        await pool.query(sql);
        console.log('Materialized views created successfully');
        return true;
      } catch (readErr) {
        console.warn('Could not read materialized-views.sql:', readErr.message);
        return false;
      }
    }

    if (!health.allPopulated) {
      console.log('Refreshing unpopulated materialized views...');
      await refreshAnalyticsViews();
    }

    return true;
  } catch (err) {
    console.error('Failed to initialize materialized views:', err.message);
    return false;
  }
}
