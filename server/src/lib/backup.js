import { prisma } from "./prisma.js";
import { runWithoutTenant, runWithTenant } from "./tenant.js";

/** Soft cap on total JSON-ish rows exported (photos never included). */
export const BACKUP_MAX_ROWS = Number(process.env.BACKUP_MAX_ROWS || 250_000);

/** What JSON restore can actually merge today (not a full DR restore). */
export const RESTORE_CAPABILITIES = {
  mode: "merge",
  schoolProfileFields: true,
  examPaperSchedules: true,
  marks: false,
  students: false,
  staff: false,
  timetables: false,
  leave: false,
  hallTickets: false,
  notifications: false,
  note:
    "Platform JSON backup is a configuration / paper-schedule export. Use pg_dump (scripts/pg-dump-backup.sh) or managed Postgres PITR for disaster recovery.",
};

const TENANT_EXPORT_MODELS = [
  { key: "classSections", model: "classSection" },
  { key: "subjects", model: "subject" },
  {
    key: "users",
    model: "user",
    omit: { passwordHash: true, mfaSecret: true, mfaRecoveryHashes: true },
  },
  // Never dump binary student photos or guardian contact into plaintext backups.
  {
    key: "students",
    model: "student",
    omit: { photoBytes: true, guardianEmail: true, photoStorageKey: true },
  },
  { key: "exams", model: "exam" },
  { key: "teacherAssignments", model: "teacherAssignment" },
  { key: "studentSubjectEnrollments", model: "studentSubjectEnrollment" },
  { key: "marks", model: "mark" },
  { key: "periods", model: "period" },
  { key: "timetableEntries", model: "timetableEntry" },
  { key: "teacherLeaves", model: "teacherLeave" },
  { key: "timetableSubstitutions", model: "timetableSubstitution" },
  { key: "examPaperSchedules", model: "examPaperSchedule" },
  { key: "reportCardReleases", model: "reportCardRelease" },
  { key: "revaluationRequests", model: "revaluationRequest" },
  { key: "hallTicketIssues", model: "hallTicketIssue" },
  { key: "boardPacks", model: "boardPack" },
  { key: "cpdTrainingPlans", model: "cpdTrainingPlan" },
  { key: "cpdObservations", model: "cpdObservation" },
  { key: "cpdAppraisals", model: "cpdAppraisal" },
  { key: "cpdCertificates", model: "cpdCertificate" },
];

function countRows(tenants) {
  let total = 0;
  for (const tenant of tenants) {
    for (const { key } of TENANT_EXPORT_MODELS) {
      total += Array.isArray(tenant[key]) ? tenant[key].length : 0;
    }
  }
  return total;
}

/**
 * Export one school (or all) as a JSON backup document.
 * Passwords/MFA secrets, student photos, and guardian contact fields are omitted.
 * This is not a full disaster-recovery archive — see RESTORE_CAPABILITIES.
 */
export async function createBackup({ schoolId = null } = {}) {
  return runWithoutTenant(async () => {
    const schools = await prisma.school.findMany({
      where: schoolId ? { id: schoolId } : undefined,
      omit: { logoBytes: true },
      orderBy: { name: "asc" },
    });
    if (schoolId && !schools.length) {
      const err = new Error("School not found");
      err.status = 404;
      throw err;
    }

    const tenants = [];
    for (const school of schools) {
      const data = { school };
      await runWithTenant(school.id, async () => {
        for (const { key, model, omit } of TENANT_EXPORT_MODELS) {
          try {
            data[key] = await prisma[model].findMany({
              ...(omit ? { omit } : {}),
              orderBy: { id: "asc" },
            });
          } catch {
            data[key] = [];
          }
        }
      });
      tenants.push(data);
    }

    const rowCount = countRows(tenants);
    if (rowCount > BACKUP_MAX_ROWS) {
      const err = new Error(
        `Backup exceeds row limit (${rowCount} > ${BACKUP_MAX_ROWS}). Export one school at a time or raise BACKUP_MAX_ROWS.`
      );
      err.status = 413;
      throw err;
    }

    return {
      format: "sma-backup-v1",
      createdAt: new Date().toISOString(),
      schoolCount: tenants.length,
      rowCount,
      restoreCapabilities: RESTORE_CAPABILITIES,
      omitted: [
        "logoBytes",
        "logoStorageKey",
        "photoBytes",
        "photoStorageKey",
        "guardianEmail",
        "passwordHash",
        "mfaSecret",
      ],
      tenants,
    };
  });
}

/**
 * Merge-restore school profile fields + exam paper schedules for an existing school.
 * Does not restore marks, students, staff, or passwords. For full DR use pg_dump / PITR.
 */
export async function restoreBackup(document, { schoolId, mode = "merge" } = {}) {
  if (!document || document.format !== "sma-backup-v1") {
    const err = new Error("Invalid backup format");
    err.status = 400;
    throw err;
  }
  if (!schoolId) {
    const err = new Error("schoolId is required");
    err.status = 400;
    throw err;
  }
  if (mode !== "merge") {
    const err = new Error("Only merge restore is supported");
    err.status = 400;
    throw err;
  }

  const tenant = (document.tenants || []).find((t) => t.school?.id === schoolId || t.school?.slug);
  if (!tenant?.school) {
    const err = new Error("Backup does not include this school");
    err.status = 404;
    throw err;
  }

  return runWithoutTenant(async () => {
    const existing = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!existing) {
      const err = new Error("School not found");
      err.status = 404;
      throw err;
    }

    const src = tenant.school;
    await prisma.school.update({
      where: { id: schoolId },
      data: {
        name: src.name ?? existing.name,
        board: src.board ?? existing.board,
        affiliationNo: src.affiliationNo ?? existing.affiliationNo,
        address: src.address ?? existing.address,
        phone: src.phone ?? existing.phone,
        email: src.email ?? existing.email,
        emailDigestsEnabled: src.emailDigestsEnabled ?? existing.emailDigestsEnabled,
        digestEmail: src.digestEmail ?? existing.digestEmail,
        passPercent: src.passPercent ?? existing.passPercent,
        distinctionMin: src.distinctionMin ?? existing.distinctionMin,
        gradeBands: src.gradeBands ?? existing.gradeBands,
        examWeights: src.examWeights ?? existing.examWeights,
        workingDays: src.workingDays ?? existing.workingDays,
        optionalModules: src.optionalModules ?? existing.optionalModules,
        academicYears: src.academicYears ?? existing.academicYears,
        currentAcademicYear: src.currentAcademicYear ?? existing.currentAcademicYear,
        assessmentPolicy: src.assessmentPolicy ?? existing.assessmentPolicy,
      },
    });

    let imported = 0;
    await runWithTenant(schoolId, async () => {
      for (const row of tenant.examPaperSchedules || []) {
        try {
          await prisma.examPaperSchedule.upsert({
            where: {
              examId_subjectId_className: {
                examId: row.examId,
                subjectId: row.subjectId,
                className: row.className ?? null,
              },
            },
            create: {
              id: row.id,
              examId: row.examId,
              subjectId: row.subjectId,
              className: row.className ?? null,
              paperDate: row.paperDate,
              startTime: row.startTime ?? null,
              endTime: row.endTime ?? null,
              venue: row.venue ?? null,
              maxMarks: row.maxMarks ?? null,
              notes: row.notes ?? null,
            },
            update: {
              paperDate: row.paperDate,
              startTime: row.startTime ?? null,
              endTime: row.endTime ?? null,
              venue: row.venue ?? null,
              maxMarks: row.maxMarks ?? null,
              notes: row.notes ?? null,
            },
          });
          imported += 1;
        } catch {
          // skip rows that reference missing exams/subjects
        }
      }
    });

    return {
      ok: true,
      schoolId,
      importedPaperSchedules: imported,
      mode,
      restoreCapabilities: RESTORE_CAPABILITIES,
      warning: RESTORE_CAPABILITIES.note,
    };
  });
}
