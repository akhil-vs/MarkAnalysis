-- Materialized view for exam statistics
-- This pre-aggregates commonly accessed analytics data
-- Refresh after mark mutations for near-real-time accuracy

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_exam_statistics AS
SELECT 
  e.id AS exam_id,
  e.name AS exam_name,
  e."tenantId" AS tenant_id,
  cs.id AS class_section_id,
  cs."className" AS class_name,
  cs.section AS section,
  s.id AS subject_id,
  s.name AS subject_name,
  s."maxMarks" AS subject_max_marks,
  COUNT(DISTINCT m."studentId") AS student_count,
  COUNT(CASE WHEN m.status = 'APPROVED' THEN 1 END) AS approved_count,
  COUNT(CASE WHEN m.status = 'DRAFT' THEN 1 END) AS draft_count,
  COUNT(CASE WHEN m.status = 'SUBMITTED' THEN 1 END) AS submitted_count,
  AVG(CASE 
    WHEN m.outcome = 'SCORED' AND m.status = 'APPROVED' 
    THEN (m."marksObtained"::float / NULLIF(s."maxMarks", 0) * 100) 
  END) AS average_percent,
  MIN(CASE 
    WHEN m.outcome = 'SCORED' AND m.status = 'APPROVED' 
    THEN (m."marksObtained"::float / NULLIF(s."maxMarks", 0) * 100) 
  END) AS min_percent,
  MAX(CASE 
    WHEN m.outcome = 'SCORED' AND m.status = 'APPROVED' 
    THEN (m."marksObtained"::float / NULLIF(s."maxMarks", 0) * 100) 
  END) AS max_percent,
  COUNT(CASE WHEN m.outcome = 'ABSENT' THEN 1 END) AS absent_count,
  COUNT(CASE WHEN m.outcome = 'EXEMPT' THEN 1 END) AS exempt_count,
  COUNT(CASE WHEN m.outcome = 'WITHHELD' THEN 1 END) AS withheld_count,
  MAX(m."updatedAt") AS last_updated
FROM "Mark" m
INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
INNER JOIN "ClassSection" cs ON cs.id = st."classSectionId"
INNER JOIN "Subject" s ON s.id = m."subjectId"
INNER JOIN "Exam" e ON e.id = m."examId"
GROUP BY e.id, e.name, e."tenantId", cs.id, cs."className", cs.section, s.id, s.name, s."maxMarks";

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_mv_exam_statistics_exam 
  ON mv_exam_statistics(exam_id);

CREATE INDEX IF NOT EXISTS idx_mv_exam_statistics_class 
  ON mv_exam_statistics(class_section_id);

CREATE INDEX IF NOT EXISTS idx_mv_exam_statistics_subject 
  ON mv_exam_statistics(subject_id);

CREATE INDEX IF NOT EXISTS idx_mv_exam_statistics_tenant 
  ON mv_exam_statistics(tenant_id);

CREATE INDEX IF NOT EXISTS idx_mv_exam_statistics_tenant_exam 
  ON mv_exam_statistics(tenant_id, exam_id);

-- Materialized view for student performance summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_student_performance AS
SELECT 
  st.id AS student_id,
  st."rollNo" AS roll_no,
  st.name AS student_name,
  st."classSectionId" AS class_section_id,
  st."tenantId" AS tenant_id,
  e.id AS exam_id,
  e.name AS exam_name,
  e."academicYear" AS academic_year,
  COUNT(DISTINCT m."subjectId") AS subjects_count,
  COUNT(CASE WHEN m.outcome = 'SCORED' AND m.status = 'APPROVED' THEN 1 END) AS scored_count,
  AVG(CASE 
    WHEN m.outcome = 'SCORED' AND m.status = 'APPROVED'
    THEN (m."marksObtained"::float / NULLIF(s."maxMarks", 0) * 100) 
  END) AS average_percent,
  SUM(CASE 
    WHEN m.outcome = 'SCORED' AND m.status = 'APPROVED' 
    THEN m."marksObtained" 
    ELSE 0 
  END) AS total_marks_obtained,
  SUM(CASE 
    WHEN m.outcome = 'SCORED' AND m.status = 'APPROVED' 
    THEN s."maxMarks" 
    ELSE 0 
  END) AS total_max_marks,
  MAX(m."updatedAt") AS last_updated
FROM "Student" st
INNER JOIN "Mark" m ON m."studentId" = st.id
INNER JOIN "Subject" s ON s.id = m."subjectId"
INNER JOIN "Exam" e ON e.id = m."examId"
WHERE st.status = 'ACTIVE'
GROUP BY st.id, st."rollNo", st.name, st."classSectionId", st."tenantId", e.id, e.name, e."academicYear";

-- Indexes for student performance view
CREATE INDEX IF NOT EXISTS idx_mv_student_performance_student 
  ON mv_student_performance(student_id);

CREATE INDEX IF NOT EXISTS idx_mv_student_performance_exam 
  ON mv_student_performance(exam_id);

CREATE INDEX IF NOT EXISTS idx_mv_student_performance_class 
  ON mv_student_performance(class_section_id);

CREATE INDEX IF NOT EXISTS idx_mv_student_performance_tenant 
  ON mv_student_performance(tenant_id);

CREATE INDEX IF NOT EXISTS idx_mv_student_performance_tenant_exam 
  ON mv_student_performance(tenant_id, exam_id);

-- Function to refresh materialized views concurrently
-- This can be called after mark mutations
CREATE OR REPLACE FUNCTION refresh_analytics_views() 
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_exam_statistics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_student_performance;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON MATERIALIZED VIEW mv_exam_statistics IS 
  'Pre-aggregated exam statistics by class and subject. Refresh after mark changes.';

COMMENT ON MATERIALIZED VIEW mv_student_performance IS 
  'Student performance summary by exam. Refresh after mark changes.';

COMMENT ON FUNCTION refresh_analytics_views() IS 
  'Refresh all analytics materialized views concurrently without blocking reads.';
