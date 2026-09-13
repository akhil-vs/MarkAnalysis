import { prisma } from "./prisma.js";
import { pickExam } from "./stats.js";
import { CacheKeys, cachedTenantLoad, invalidateCurrentTenantCache } from "./tenantCache.js";

/** Cached exam list (no consolidation include) for analytics / consolidated helpers. */
export async function listExamsBasic() {
  return cachedTenantLoad(CacheKeys.EXAMS_BASIC, () =>
    prisma.exam.findMany({ orderBy: { date: "asc" } })
  );
}

export async function loadExams(examId) {
  const exams = await listExamsBasic();
  return { exams, exam: pickExam(exams, examId) };
}

export function invalidateExamCatalog() {
  invalidateCurrentTenantCache(CacheKeys.EXAMS_BASIC);
}
