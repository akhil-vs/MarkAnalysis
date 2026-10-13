/**
 * Boot-time SQL preheat for analytics aggregates.
 *
 * Runs the same GROUP BY shapes cold overviews use so Postgres plans and the
 * pool are hot before the first principal request. Does NOT write insight-cache
 * stubs (those must be full API payloads from real route loaders).
 *
 * Disabled on Vercel serverless. Opt out with WARM_ANALYTICS_ON_BOOT=0.
 */
import { prisma } from "./prisma.js";
import { runWithTenant, runWithoutTenant } from "./tenant.js";
import { loadExams } from "./examCatalog.js";
import { logger } from "./logger.js";
import {
  aggregateByClassName,
  aggregateByClassSection,
  aggregateByExam,
  aggregateByPaper,
  aggregateByStudent,
  aggregateBySubjectName,
} from "./markAggregates.js";
import { historyExamIdsForDetail, SCHOOL_DETAIL_HISTORY_PRIOR } from "./analyticsMarks.js";

function truthy(value, defaultValue = true) {
  if (value == null || value === "") return defaultValue;
  const raw = String(value).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function shouldWarmAnalyticsOnBoot(env = process.env) {
  if (env.VERCEL) return false;
  return truthy(env.WARM_ANALYTICS_ON_BOOT, env.NODE_ENV !== "test");
}

async function warmTenant(tenantId) {
  return runWithTenant(tenantId, async () => {
    const { exams, exam } = await loadExams();
    if (!exam) return { warmed: false, reason: "no-exam" };

    const otherExamIds = historyExamIdsForDetail(exams, exam, {
      maxSameTypePrior: SCHOOL_DETAIL_HISTORY_PRIOR,
    });
    const trendExamIds = [exam.id, ...otherExamIds];
    const classes = await prisma.classSection.findMany({ select: { id: true } });
    const classSectionIds = classes.map((c) => c.id);

    await Promise.all([
      aggregateByClassSection({ examIds: trendExamIds, classSectionIds }),
      aggregateByClassName({ examIds: trendExamIds, classSectionIds }),
      aggregateBySubjectName({ examIds: trendExamIds, classSectionIds }),
      aggregateByExam({ examIds: trendExamIds, classSectionIds }),
      aggregateByPaper({ examIds: [exam.id], classSectionIds }),
      aggregateByStudent({ examId: exam.id, classSectionIds }),
    ]);

    return { warmed: true, examId: exam.id };
  });
}

/**
 * Preheat analytics SQL for active school tenants after listen().
 */
export function startAnalyticsWarm({ delayMs = 2_500, env = process.env } = {}) {
  if (!shouldWarmAnalyticsOnBoot(env)) {
    return { started: false, reason: "disabled" };
  }

  const run = async () => {
    try {
      const max =
        Number(env.WARM_ANALYTICS_MAX_TENANTS) > 0 ? Number(env.WARM_ANALYTICS_MAX_TENANTS) : 8;
      const schools = await runWithoutTenant(() =>
        prisma.school.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, slug: true },
          take: max,
        })
      );
      const results = [];
      for (const school of schools) {
        try {
          results.push({ slug: school.slug, ...(await warmTenant(school.id)) });
        } catch (err) {
          results.push({ slug: school.slug, warmed: false, error: err?.message || String(err) });
        }
      }
      logger.info("analytics SQL warm complete", {
        tenants: results.length,
        ok: results.filter((r) => r.warmed).length,
      });
      return results;
    } catch (err) {
      logger.warn("analytics SQL warm failed", { error: err?.message || String(err) });
      return null;
    }
  };

  const timer = setTimeout(() => {
    run().catch(() => {});
  }, Math.max(0, delayMs));
  if (typeof timer.unref === "function") timer.unref();
  return { started: true, delayMs };
}
