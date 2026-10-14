/**
 * SQL mark aggregates for cold analytics — avoid hydrating tens of thousands of
 * nested Prisma mark graphs just to compute average / paper passRate / yearSeries.
 *
 * `passRate` here is **paper-level** (combined % ≥ passPercent). Board / student
 * pass KPIs must use `computeBoardPassStats` / `evaluateStudentPass` instead.
 *
 * Always requires tenantId (raw SQL bypasses Prisma tenant middleware).
 */
import { prisma } from "./prisma.js";
import { getTenantId } from "./tenant.js";
import { PASS_PERCENT, round1 } from "./grades.js";
import { examLabel, sameTypeExams } from "./stats.js";

function requireTenant(explicit) {
  const tenantId = explicit || getTenantId();
  if (!tenantId) {
    const err = new Error("Missing tenant context");
    err.status = 500;
    throw err;
  }
  return tenantId;
}

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Shared percent expression matching stats.toPercent / subjectEntryMax. */
const PCT_SQL = `
  CASE
    WHEN COALESCE(m.outcome::text, 'SCORED') = 'SCORED'
      AND NULLIF(s."maxMarks" + COALESCE(s."practicalMaxMarks", 0), 0) IS NOT NULL
    THEN LEAST(
      100::float,
      GREATEST(
        0::float,
        (COALESCE(m."marksObtained", 0) + COALESCE(m."practicalMarks", 0))::float
          / (s."maxMarks" + COALESCE(s."practicalMaxMarks", 0))::float
          * 100
      )
    )
    ELSE NULL
  END
`;

function summarizeAgg(row, passPercent = PASS_PERCENT) {
  const count = Number(row?.count) || 0;
  const passCount = Number(row?.passCount) || 0;
  return {
    average: round1(num(row?.average)),
    median: round1(num(row?.median)),
    highest: round1(num(row?.highest)),
    lowest: round1(num(row?.lowest)),
    passRate: count ? round1((passCount / count) * 100) : 0,
    count,
  };
}

/**
 * Aggregate APPROVED + ACTIVE scored marks by class section × exam.
 * @returns {Promise<Array<{classSectionId, className, section, examId, ...stats}>>}
 */
export async function aggregateByClassSection({
  examIds,
  classSectionIds,
  classNames,
  passPercent = PASS_PERCENT,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  const ids = [...new Set((examIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const params = [tenant, ids, passPercent];
  const filters = [];
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    filters.push(`AND cs.id = ANY($${params.length}::text[])`);
  }
  if (classNames?.length) {
    params.push(classNames);
    filters.push(`AND cs."className" = ANY($${params.length}::text[])`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      cs.id AS "classSectionId",
      cs."className" AS "className",
      cs.section AS "section",
      m."examId" AS "examId",
      COUNT(*) FILTER (WHERE pct IS NOT NULL)::int AS count,
      AVG(pct) AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY pct) FILTER (WHERE pct IS NOT NULL) AS median,
      MAX(pct) AS highest,
      MIN(pct) AS lowest,
      COUNT(*) FILTER (WHERE pct IS NOT NULL AND pct >= $3)::int AS "passCount"
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "ClassSection" cs ON cs.id = st."classSectionId"
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    CROSS JOIN LATERAL (SELECT (${PCT_SQL}) AS pct) p
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = ANY($2::text[])
      ${filters.join("\n")}
    GROUP BY cs.id, cs."className", cs.section, m."examId"
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    classSectionId: r.classSectionId,
    className: r.className,
    section: r.section,
    examId: r.examId,
    ...summarizeAgg(r, passPercent),
  }));
}

/**
 * Aggregate by className × exam (rolled-up divisions).
 */
export async function aggregateByClassName({
  examIds,
  classSectionIds,
  classNames,
  passPercent = PASS_PERCENT,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  const ids = [...new Set((examIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const params = [tenant, ids, passPercent];
  const filters = [];
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    filters.push(`AND cs.id = ANY($${params.length}::text[])`);
  }
  if (classNames?.length) {
    params.push(classNames);
    filters.push(`AND cs."className" = ANY($${params.length}::text[])`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      cs."className" AS "className",
      m."examId" AS "examId",
      COUNT(*) FILTER (WHERE pct IS NOT NULL)::int AS count,
      AVG(pct) AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY pct) FILTER (WHERE pct IS NOT NULL) AS median,
      MAX(pct) AS highest,
      MIN(pct) AS lowest,
      COUNT(*) FILTER (WHERE pct IS NOT NULL AND pct >= $3)::int AS "passCount"
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "ClassSection" cs ON cs.id = st."classSectionId"
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    CROSS JOIN LATERAL (SELECT (${PCT_SQL}) AS pct) p
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = ANY($2::text[])
      ${filters.join("\n")}
    GROUP BY cs."className", m."examId"
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    className: r.className,
    examId: r.examId,
    ...summarizeAgg(r, passPercent),
  }));
}

/**
 * Aggregate by subject name × exam (and optional subject id / name filters).
 */
export async function aggregateBySubjectName({
  examIds,
  subjectIds,
  subjectNames,
  classSectionIds,
  passPercent = PASS_PERCENT,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  const ids = [...new Set((examIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const params = [tenant, ids, passPercent];
  const filters = [];
  if (subjectIds?.length) {
    params.push(subjectIds);
    filters.push(`AND s.id = ANY($${params.length}::text[])`);
  }
  if (subjectNames?.length) {
    params.push(subjectNames);
    filters.push(`AND s.name = ANY($${params.length}::text[])`);
  }
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    filters.push(`AND st."classSectionId" = ANY($${params.length}::text[])`);
  }
  const subjectFilter = filters.join("\n");

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      s.name AS "subjectName",
      m."examId" AS "examId",
      COUNT(*) FILTER (WHERE pct IS NOT NULL)::int AS count,
      AVG(pct) AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY pct) FILTER (WHERE pct IS NOT NULL) AS median,
      MAX(pct) AS highest,
      MIN(pct) AS lowest,
      COUNT(*) FILTER (WHERE pct IS NOT NULL AND pct >= $3)::int AS "passCount"
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    CROSS JOIN LATERAL (SELECT (${PCT_SQL}) AS pct) p
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = ANY($2::text[])
      ${subjectFilter}
    GROUP BY s.name, m."examId"
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    subjectName: r.subjectName,
    examId: r.examId,
    ...summarizeAgg(r, passPercent),
  }));
}

/** Aggregate by subjectId × exam (paper-level). */
export async function aggregateBySubjectId({
  examIds,
  subjectIds,
  passPercent = PASS_PERCENT,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  const ids = [...new Set((examIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const params = [tenant, ids, passPercent];
  let subjectFilter = "";
  if (subjectIds?.length) {
    params.push(subjectIds);
    subjectFilter = `AND s.id = ANY($${params.length}::text[])`;
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      s.id AS "subjectId",
      s.name AS "subjectName",
      s."className" AS "className",
      m."examId" AS "examId",
      COUNT(*) FILTER (WHERE pct IS NOT NULL)::int AS count,
      AVG(pct) AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY pct) FILTER (WHERE pct IS NOT NULL) AS median,
      MAX(pct) AS highest,
      MIN(pct) AS lowest,
      COUNT(*) FILTER (WHERE pct IS NOT NULL AND pct >= $3)::int AS "passCount"
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    CROSS JOIN LATERAL (SELECT (${PCT_SQL}) AS pct) p
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = ANY($2::text[])
      ${subjectFilter}
    GROUP BY s.id, s.name, s."className", m."examId"
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    subjectId: r.subjectId,
    subjectName: r.subjectName,
    className: r.className,
    examId: r.examId,
    ...summarizeAgg(r, passPercent),
  }));
}

/**
 * Aggregate by paper (subjectId × classSectionId × exam) for teacher/staff stats.
 */
export async function aggregateByPaper({
  examIds,
  classSectionIds,
  subjectIds,
  subjectNames,
  passPercent = PASS_PERCENT,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  const ids = [...new Set((examIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const params = [tenant, ids, passPercent];
  const filters = [];
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    filters.push(`AND st."classSectionId" = ANY($${params.length}::text[])`);
  }
  if (subjectIds?.length) {
    params.push(subjectIds);
    filters.push(`AND s.id = ANY($${params.length}::text[])`);
  }
  if (subjectNames?.length) {
    params.push(subjectNames);
    filters.push(`AND s.name = ANY($${params.length}::text[])`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      m."subjectId" AS "subjectId",
      st."classSectionId" AS "classSectionId",
      m."examId" AS "examId",
      COUNT(*) FILTER (WHERE pct IS NOT NULL)::int AS count,
      AVG(pct) AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY pct) FILTER (WHERE pct IS NOT NULL) AS median,
      MAX(pct) AS highest,
      MIN(pct) AS lowest,
      COUNT(*) FILTER (WHERE pct IS NOT NULL AND pct >= $3)::int AS "passCount"
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    CROSS JOIN LATERAL (SELECT (${PCT_SQL}) AS pct) p
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = ANY($2::text[])
      ${filters.join("\n")}
    GROUP BY m."subjectId", st."classSectionId", m."examId"
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    subjectId: r.subjectId,
    classSectionId: r.classSectionId,
    examId: r.examId,
    ...summarizeAgg(r, passPercent),
  }));
}

/**
 * Per-student averages for one exam (toppers / at-risk / gradeDist).
 */
export async function aggregateByStudent({
  examId,
  classSectionIds,
  subjectIds,
  subjectNames,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  if (!examId) return [];

  const params = [tenant, examId];
  const filters = [];
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    filters.push(`AND st."classSectionId" = ANY($${params.length}::text[])`);
  }
  if (subjectIds?.length) {
    params.push(subjectIds);
    filters.push(`AND s.id = ANY($${params.length}::text[])`);
  }
  if (subjectNames?.length) {
    params.push(subjectNames);
    filters.push(`AND s.name = ANY($${params.length}::text[])`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      st.id AS "studentId",
      st.name AS "name",
      st."rollNo" AS "rollNo",
      st."classSectionId" AS "classSectionId",
      cs."className" AS "className",
      cs.section AS "section",
      COUNT(*) FILTER (WHERE pct IS NOT NULL)::int AS count,
      AVG(pct) AS average
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "ClassSection" cs ON cs.id = st."classSectionId"
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    CROSS JOIN LATERAL (SELECT (${PCT_SQL}) AS pct) p
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = $2
      ${filters.join("\n")}
    GROUP BY st.id, st.name, st."rollNo", st."classSectionId", cs."className", cs.section
    HAVING COUNT(*) FILTER (WHERE pct IS NOT NULL) > 0
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    studentId: r.studentId,
    name: r.name,
    rollNo: r.rollNo,
    classSectionId: r.classSectionId,
    className: r.className,
    section: r.section,
    avg: round1(num(r.average)),
    count: Number(r.count) || 0,
  }));
}

/** Whole-exam (or multi-exam) KPI rollup. */
export async function aggregateByExam({
  examIds,
  classSectionIds,
  classNames,
  subjectNames,
  subjectIds,
  passPercent = PASS_PERCENT,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  const ids = [...new Set((examIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const params = [tenant, ids, passPercent];
  const filters = [];
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    filters.push(`AND st."classSectionId" = ANY($${params.length}::text[])`);
  }
  if (classNames?.length) {
    params.push(classNames);
    filters.push(
      `AND st."classSectionId" IN (SELECT id FROM "ClassSection" WHERE "className" = ANY($${params.length}::text[]))`
    );
  }
  if (subjectIds?.length) {
    params.push(subjectIds);
    filters.push(`AND s.id = ANY($${params.length}::text[])`);
  }
  if (subjectNames?.length) {
    params.push(subjectNames);
    filters.push(`AND s.name = ANY($${params.length}::text[])`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      m."examId" AS "examId",
      COUNT(*) FILTER (WHERE pct IS NOT NULL)::int AS count,
      AVG(pct) AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY pct) FILTER (WHERE pct IS NOT NULL) AS median,
      MAX(pct) AS highest,
      MIN(pct) AS lowest,
      COUNT(*) FILTER (WHERE pct IS NOT NULL AND pct >= $3)::int AS "passCount"
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    CROSS JOIN LATERAL (SELECT (${PCT_SQL}) AS pct) p
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = ANY($2::text[])
      ${filters.join("\n")}
    GROUP BY m."examId"
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    examId: r.examId,
    ...summarizeAgg(r, passPercent),
  }));
}

/**
 * Build yearComparison rows from pre-aggregated per-exam stats.
 * @param {Map<string, object>|object[]} stats - Map examId→summarize shape, or array with examId
 */
export function yearSeriesFromAgg(stats, exams, exam) {
  const byExam = stats instanceof Map
    ? stats
    : new Map((stats || []).map((s) => [s.examId, s]));
  return sameTypeExams(exams, exam).map((e) => {
    const s = byExam.get(e.id) || {};
    return {
      examId: e.id,
      examName: e.name,
      academicYear: e.academicYear,
      label: examLabel(e),
      type: e.type,
      average: s.average ?? null,
      median: s.median ?? null,
      highest: s.highest ?? null,
      lowest: s.lowest ?? null,
      passRate: s.passRate ?? 0,
      count: s.count ?? 0,
    };
  });
}

/**
 * Merge paper-level aggregates into one summarize() for a set of papers
 * (used for teacher totals across assignments). Weighted by mark count.
 */
export function mergePaperStats(paperStats, passPercent = PASS_PERCENT) {
  let count = 0;
  let passCount = 0;
  let sum = 0;
  let highest = null;
  let lowest = null;
  for (const s of paperStats || []) {
    const c = s.count || 0;
    if (!c || s.average == null) continue;
    count += c;
    sum += s.average * c;
    // Reconstruct approximate pass count from passRate
    passCount += Math.round(((s.passRate || 0) / 100) * c);
    if (s.highest != null) highest = highest == null ? s.highest : Math.max(highest, s.highest);
    if (s.lowest != null) lowest = lowest == null ? s.lowest : Math.min(lowest, s.lowest);
  }
  return {
    average: count ? round1(sum / count) : null,
    median: null, // not meaningful after merge without raw values
    highest: round1(highest),
    lowest: round1(lowest),
    passRate: count ? round1((passCount / count) * 100) : 0,
    count,
  };
}

/** Spread summarize-shaped fields from an aggregate row (or empty defaults). */
export function statsFields(row) {
  return {
    average: row?.average ?? null,
    median: row?.median ?? null,
    highest: row?.highest ?? null,
    lowest: row?.lowest ?? null,
    passRate: row?.passRate ?? 0,
    count: row?.count ?? 0,
  };
}

/**
 * Slim student × subject percents for correlation matrices (no nested Prisma graphs).
 * @returns {Promise<Array<{studentId, classSectionId, subjectName, pct}>>}
 */
export async function loadStudentSubjectPercents({
  examId,
  classSectionIds,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  if (!examId) return [];

  const params = [tenant, examId];
  let classFilter = "";
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    classFilter = `AND st."classSectionId" = ANY($${params.length}::text[])`;
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      m."studentId" AS "studentId",
      st."classSectionId" AS "classSectionId",
      s.name AS "subjectName",
      (${PCT_SQL}) AS pct
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = $2
      ${classFilter}
    `,
    ...params
  );

  return (rows || [])
    .map((r) => ({
      studentId: r.studentId,
      classSectionId: r.classSectionId,
      subjectName: r.subjectName,
      pct: num(r.pct),
    }))
    .filter((r) => r.pct != null);
}

/**
 * Slim APPROVED mark rows shaped for computeBoardPassStats / outcomeBreakdown /
 * markBandHistogram — flat SQL, no nested Prisma mark graphs.
 */
export async function loadSlimApprovedMarks({
  examId,
  classSectionIds,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  if (!examId) return [];

  const params = [tenant, examId];
  let classFilter = "";
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    classFilter = `AND st."classSectionId" = ANY($${params.length}::text[])`;
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      m."studentId" AS "studentId",
      m."subjectId" AS "subjectId",
      m."marksObtained" AS "marksObtained",
      m."practicalMarks" AS "practicalMarks",
      COALESCE(m.outcome::text, 'SCORED') AS outcome,
      st."classSectionId" AS "classSectionId",
      cs."className" AS "className",
      cs.section AS section,
      st.name AS "studentName",
      st."rollNo" AS "rollNo",
      s.name AS "subjectName",
      s."maxMarks" AS "maxMarks",
      s."practicalMaxMarks" AS "practicalMaxMarks"
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    INNER JOIN "ClassSection" cs ON cs.id = st."classSectionId"
    INNER JOIN "Subject" s ON s.id = m."subjectId"
    WHERE m."tenantId" = $1
      AND m.status = 'APPROVED'
      AND m."examId" = $2
      ${classFilter}
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    studentId: r.studentId,
    subjectId: r.subjectId,
    marksObtained: r.marksObtained != null ? Number(r.marksObtained) : null,
    practicalMarks: r.practicalMarks != null ? Number(r.practicalMarks) : null,
    outcome: r.outcome || "SCORED",
    status: "APPROVED",
    student: {
      id: r.studentId,
      name: r.studentName,
      rollNo: r.rollNo,
      status: "ACTIVE",
      classSectionId: r.classSectionId,
      classSection: { className: r.className, section: r.section },
    },
    subject: {
      id: r.subjectId,
      name: r.subjectName,
      maxMarks: r.maxMarks != null ? Number(r.maxMarks) : null,
      practicalMaxMarks: r.practicalMaxMarks != null ? Number(r.practicalMaxMarks) : null,
    },
  }));
}

/**
 * Per-paper register progress counts (all statuses) for pending-upload desks.
 * Cheaper than hydrating every mark status row.
 */
export async function aggregateRegisterStatusByPaper({
  examId,
  classSectionIds,
  subjectIds,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  if (!examId) return [];

  const params = [tenant, examId];
  const filters = [];
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    filters.push(`AND st."classSectionId" = ANY($${params.length}::text[])`);
  }
  if (subjectIds?.length) {
    params.push(subjectIds);
    filters.push(`AND m."subjectId" = ANY($${params.length}::text[])`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      m."subjectId" AS "subjectId",
      st."classSectionId" AS "classSectionId",
      COUNT(*)::int AS uploaded,
      COUNT(*) FILTER (WHERE m.status = 'APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE m.status = 'SUBMITTED')::int AS submitted,
      COUNT(*) FILTER (WHERE m.status = 'DRAFT')::int AS draft
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    WHERE m."tenantId" = $1
      AND m."examId" = $2
      ${filters.join("\n")}
    GROUP BY m."subjectId", st."classSectionId"
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    subjectId: r.subjectId,
    classSectionId: r.classSectionId,
    uploaded: Number(r.uploaded) || 0,
    approved: Number(r.approved) || 0,
    submitted: Number(r.submitted) || 0,
    draft: Number(r.draft) || 0,
  }));
}

/**
 * Same as aggregateRegisterStatusByPaper but also grouped by enteredById
 * (teacher ownership on the registers desk).
 */
export async function aggregateRegisterStatusByPaperTeacher({
  examId,
  classSectionIds,
  subjectIds,
  tenantId,
} = {}) {
  const tenant = requireTenant(tenantId);
  if (!examId) return [];

  const params = [tenant, examId];
  const filters = [];
  if (classSectionIds?.length) {
    params.push(classSectionIds);
    filters.push(`AND st."classSectionId" = ANY($${params.length}::text[])`);
  }
  if (subjectIds?.length) {
    params.push(subjectIds);
    filters.push(`AND m."subjectId" = ANY($${params.length}::text[])`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      m."subjectId" AS "subjectId",
      st."classSectionId" AS "classSectionId",
      m."enteredById" AS "enteredById",
      COUNT(*)::int AS uploaded,
      COUNT(*) FILTER (WHERE m.status = 'APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE m.status = 'SUBMITTED')::int AS submitted,
      COUNT(*) FILTER (WHERE m.status = 'DRAFT')::int AS draft
    FROM "Mark" m
    INNER JOIN "Student" st ON st.id = m."studentId" AND st.status = 'ACTIVE'
    WHERE m."tenantId" = $1
      AND m."examId" = $2
      ${filters.join("\n")}
    GROUP BY m."subjectId", st."classSectionId", m."enteredById"
    `,
    ...params
  );

  return (rows || []).map((r) => ({
    subjectId: r.subjectId,
    classSectionId: r.classSectionId,
    enteredById: r.enteredById,
    uploaded: Number(r.uploaded) || 0,
    approved: Number(r.approved) || 0,
    submitted: Number(r.submitted) || 0,
    draft: Number(r.draft) || 0,
  }));
}
