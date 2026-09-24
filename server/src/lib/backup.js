import { prisma } from "./prisma.js";
import { runWithoutTenant, runWithTenant } from "./tenant.js";

const TENANT_EXPORT_MODELS = [
  { key: "classSections", model: "classSection" },
  { key: "subjects", model: "subject" },
  { key: "users", model: "user", omit: { passwordHash: true, mfaSecret: true, mfaRecoveryHashes: true } },
  { key: "students", model: "student" },
  { key: "exams", model: "exam" },
  { key: "teacherAssignments", model: "teacherAssignment" },
  { key: "studentSubjectEnrollments", model: "studentSubjectEnrollment" },
  { key: "marks", model: "mark" },
  { key: "periods", model: "period" },
  { key: "timetableEntries", model: "timetableEntry" },
  { key: "examPaperSchedules", model: "examPaperSchedule" },
  { key: "reportCardReleases", model: "reportCardRelease" },
  { key: "revaluationRequests", model: "revaluationRequest" },
  { key: "cpdTrainingPlans", model: "cpdTrainingPlan" },
  { key: "cpdObservations", model: "cpdObservation" },
  { key: "cpdAppraisals", model: "cpdAppraisal" },
  { key: "cpdCertificates", model: "cpdCertificate" },
];

/**
 * Export one school (or all) as a JSON backup document.
 * Passwords/MFA secrets are omitted from user rows.
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
          data[key] = await prisma[model].findMany({
            ...(omit ? { omit } : {}),
            orderBy: { id: "asc" },
          });
        }
      });
      tenants.push(data);
    }

    return {
      format: "sma-backup-v1",
      createdAt: new Date().toISOString(),
      schoolCount: tenants.length,
      tenants,
    };
  });
}

/**
 * Restore school profile fields + selected operational rows for an existing school.
 * Does not create users (password hashes are not in backups). Safe merge for
 * paper schedules, CPD, report releases when ids are new.
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

    return { ok: true, schoolId, importedPaperSchedules: imported, mode };
  });
}
