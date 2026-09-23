import { prisma } from "./prisma.js";
import { DEFAULT_PERIODS } from "./periods.js";
import { invalidateTenantCache } from "./tenantCache.js";
import { runWithoutTenant, runWithTenant } from "./tenant.js";

/**
 * FK-safe delete order for tenant-scoped tables (children before parents).
 * Staff / school are handled separately after these models.
 */
export const TENANT_DELETE_ORDER = [
  "timetableSubstitution",
  "teacherLeave",
  "markAudit",
  "mark",
  "markEntryAccessRequest",
  "revaluationRequest",
  "reportCardRelease",
  "hallTicketIssue",
  "boardPack",
  "examPaperSchedule",
  "notification",
  "emailOutbox",
  "activityAudit",
  "cpdCertificate",
  "cpdAppraisal",
  "cpdObservation",
  "cpdTrainingPlan",
  "timetableEntry",
  "teacherAssignment",
  "studentSubjectEnrollment",
  "portalAccessLink",
  "student",
  "exam",
  "subject",
  "subjectPoolItem",
  "classSection",
  "period",
];

/** Selectable admin categories for school data wipe. */
export const SCHOOL_DATA_CATEGORIES = [
  {
    id: "marks",
    label: "Marks & related",
    description: "Scores, mark audits, late/edit requests, revaluations, report-card releases",
    models: ["markAudit", "mark", "markEntryAccessRequest", "revaluationRequest", "reportCardRelease"],
  },
  {
    id: "exams",
    label: "Exams & board packs",
    description: "Exams, paper schedules, hall tickets, board upload packs",
    models: ["examPaperSchedule", "hallTicketIssue", "boardPack", "exam"],
    requires: ["marks"],
  },
  {
    id: "students",
    label: "Students",
    description: "Student records, elective enrollments, parent portal links",
    models: ["studentSubjectEnrollment", "portalAccessLink", "student"],
    requires: ["marks"],
  },
  {
    id: "classes",
    label: "Classes / sections",
    description: "Class–section rows (and anything that still references them)",
    models: ["classSection"],
    requires: ["students", "assignments", "timetables", "marks"],
  },
  {
    id: "subjects",
    label: "Subjects",
    description: "Class subjects and the school subject pool",
    models: ["subject", "subjectPoolItem"],
    requires: ["marks", "assignments", "exams", "timetables"],
  },
  {
    id: "assignments",
    label: "Teacher assignments",
    description: "Paper / class assignments for teachers",
    models: ["teacherAssignment"],
  },
  {
    id: "timetables",
    label: "Timetables & leave",
    description: "Periods, weekly grid, teacher leave, substitutions",
    models: ["timetableSubstitution", "teacherLeave", "timetableEntry", "period"],
  },
  {
    id: "cpd",
    label: "CPD",
    description: "Training plans, observations, appraisals, certificates",
    models: ["cpdCertificate", "cpdAppraisal", "cpdObservation", "cpdTrainingPlan"],
  },
  {
    id: "notifications",
    label: "Notifications & email queue",
    description: "In-app notifications and outbound email outbox rows",
    models: ["notification", "emailOutbox"],
  },
  {
    id: "activity",
    label: "Activity audit log",
    description: "Operational activity history for this school",
    models: ["activityAudit"],
  },
  {
    id: "staff",
    label: "Staff accounts",
    description: "School staff users (optionally keep principals). Clears dependent staff-owned rows first.",
    models: [],
    special: "staff",
    requires: ["marks", "exams", "cpd", "notifications", "activity", "assignments", "timetables"],
  },
];

const CATEGORY_BY_ID = Object.fromEntries(SCHOOL_DATA_CATEGORIES.map((c) => [c.id, c]));

const ALL_CATEGORY_IDS = SCHOOL_DATA_CATEGORIES.map((c) => c.id);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Expand selected categories with their transitive `requires` dependencies. */
export function expandCategories(selected = []) {
  const wanted = new Set();
  const queue = [];
  for (const id of selected) {
    if (!CATEGORY_BY_ID[id]) throw httpError(400, `Unknown data category: ${id}`);
    queue.push(id);
  }
  while (queue.length) {
    const id = queue.shift();
    if (wanted.has(id)) continue;
    wanted.add(id);
    for (const dep of CATEGORY_BY_ID[id].requires || []) {
      if (!wanted.has(dep)) queue.push(dep);
    }
  }
  return [...wanted];
}

/** Collect prisma model names to delete for the expanded category set. */
export function modelsForCategories(expandedIds) {
  const models = new Set();
  for (const id of expandedIds) {
    const cat = CATEGORY_BY_ID[id];
    for (const model of cat.models || []) models.add(model);
  }
  // Staff wipe also drops portal links created by staff even if students stay.
  if (expandedIds.includes("staff") && !models.has("portalAccessLink")) {
    models.add("portalAccessLink");
  }
  return TENANT_DELETE_ORDER.filter((m) => models.has(m));
}

async function countModel(model, schoolId) {
  const client = prisma[model];
  if (!client?.count) return 0;
  try {
    return await client.count({ where: { tenantId: schoolId } });
  } catch {
    // Table may not exist yet on older DBs — treat as empty.
    return 0;
  }
}

async function deleteModel(model, schoolId) {
  const client = prisma[model];
  if (!client?.deleteMany) return 0;
  try {
    const result = await client.deleteMany({ where: { tenantId: schoolId } });
    return result?.count ?? 0;
  } catch (err) {
    // Missing table / enum — skip so partial schema catch-up does not block wipe.
    if (/does not exist|Unknown arg|Unknown model/i.test(String(err?.message || err))) {
      return 0;
    }
    throw err;
  }
}

/**
 * Counts per category (and raw model counts) for the admin preview UI.
 */
export async function schoolDataCounts(schoolId) {
  return runWithoutTenant(async () => {
    const modelCounts = {};
    await Promise.all(
      TENANT_DELETE_ORDER.map(async (model) => {
        modelCounts[model] = await countModel(model, schoolId);
      })
    );

    const staffTotal = await prisma.user.count({ where: { tenantId: schoolId } });
    const staffPrincipals = await prisma.user.count({
      where: { tenantId: schoolId, role: "PRINCIPAL" },
    });

    const categories = SCHOOL_DATA_CATEGORIES.map((cat) => {
      if (cat.special === "staff") {
        return {
          id: cat.id,
          label: cat.label,
          description: cat.description,
          count: staffTotal,
          detail: { staff: staffTotal, principals: staffPrincipals },
        };
      }
      const count = (cat.models || []).reduce((sum, m) => sum + (modelCounts[m] || 0), 0);
      return {
        id: cat.id,
        label: cat.label,
        description: cat.description,
        count,
        models: Object.fromEntries((cat.models || []).map((m) => [m, modelCounts[m] || 0])),
      };
    });

    return {
      categories,
      modelCounts,
      staff: { total: staffTotal, principals: staffPrincipals },
      allCategoryIds: ALL_CATEGORY_IDS,
    };
  });
}

async function deleteStaffAccounts(schoolId, { keepPrincipals }) {
  const where = keepPrincipals
    ? { tenantId: schoolId, role: { not: "PRINCIPAL" } }
    : { tenantId: schoolId };

  const users = await prisma.user.findMany({
    where,
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (!userIds.length) return { staffDeleted: 0 };

  // Clear optional FKs that would block user delete without wiping parent rows.
  await prisma.classSection.updateMany({
    where: { tenantId: schoolId, classTeacherId: { in: userIds } },
    data: { classTeacherId: null },
  });
  try {
    await prisma.exam.updateMany({
      where: { tenantId: schoolId, consolidationLockedById: { in: userIds } },
      data: { consolidationLockedById: null },
    });
  } catch {
    // Column may be absent on older DBs.
  }

  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  const result = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  return { staffDeleted: result?.count ?? 0 };
}

/**
 * Delete selected (or complete) operational data for one school.
 *
 * @param {string} schoolId
 * @param {{
 *   categories?: string[],
 *   complete?: boolean,
 *   keepPrincipals?: boolean,
 *   restoreDefaultPeriods?: boolean,
 *   deleteSchool?: boolean,
 *   confirmSlug: string,
 *   confirmName?: string,
 * }} options
 */
export async function deleteSchoolData(schoolId, options = {}) {
  const {
    categories = [],
    complete = false,
    keepPrincipals = true,
    restoreDefaultPeriods = false,
    deleteSchool = false,
    confirmSlug,
    confirmName,
  } = options;

  if (!confirmSlug || typeof confirmSlug !== "string") {
    throw httpError(400, "Type the school code (slug) to confirm deletion");
  }

  return runWithoutTenant(async () => {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      omit: { logoBytes: true },
    });
    if (!school) throw httpError(404, "School not found");
    if (confirmSlug.trim().toLowerCase() !== school.slug.toLowerCase()) {
      throw httpError(400, "Confirmation code does not match this school");
    }
    if (deleteSchool) {
      const expected = String(confirmName || "").trim();
      if (!expected || expected !== school.name) {
        throw httpError(400, "Type the exact school name to permanently delete the school");
      }
    }

    const selected = complete ? [...ALL_CATEGORY_IDS] : [...categories];
    if (deleteSchool) {
      for (const id of ALL_CATEGORY_IDS) {
        if (!selected.includes(id)) selected.push(id);
      }
    }
    if (!selected.length) throw httpError(400, "Select at least one data category");

    const expanded = expandCategories(selected);
    // When removing the school itself, always remove every staff account.
    const effectiveKeepPrincipals = deleteSchool ? false : Boolean(keepPrincipals);
    const models = modelsForCategories(expanded);

    const deleted = {};
    let totalRows = 0;

    await runWithTenant(schoolId, async () => {
      for (const model of models) {
        const count = await deleteModel(model, schoolId);
        deleted[model] = count;
        totalRows += count;
      }

      if (expanded.includes("staff") || deleteSchool) {
        const staffResult = await deleteStaffAccounts(schoolId, {
          keepPrincipals: effectiveKeepPrincipals,
        });
        deleted.staff = staffResult.staffDeleted;
        totalRows += staffResult.staffDeleted;
      }

      if (restoreDefaultPeriods && (expanded.includes("timetables") || complete || deleteSchool)) {
        const remaining = await prisma.period.count({ where: { tenantId: schoolId } });
        if (remaining === 0 && DEFAULT_PERIODS.length) {
          await prisma.period.createMany({
            data: DEFAULT_PERIODS.map((p) => ({ ...p, tenantId: schoolId })),
          });
          deleted.periodsRestored = DEFAULT_PERIODS.length;
        }
      }
    });

    let schoolDeleted = false;
    if (deleteSchool) {
      await prisma.school.delete({ where: { id: schoolId } });
      schoolDeleted = true;
    }

    invalidateTenantCache(schoolId);

    return {
      ok: true,
      schoolId,
      slug: school.slug,
      name: school.name,
      categories: expanded,
      deleted,
      totalRows,
      keepPrincipals: effectiveKeepPrincipals,
      schoolDeleted,
      restoreDefaultPeriods: Boolean(restoreDefaultPeriods),
    };
  });
}

export function listSchoolDataCategories() {
  return SCHOOL_DATA_CATEGORIES.map(({ id, label, description, requires, special }) => ({
    id,
    label,
    description,
    requires: requires || [],
    special: special || null,
  }));
}
