import { prisma } from "./prisma.js";
import { loadExams } from "./examCatalog.js";
import { normalizeSchoolSection } from "./schoolSections.js";
import { ensureUserWorkspaceColumn } from "./ensureSchema.js";

/** Normalize raw User.workspace JSON into a stable shape. */
export function normalizeWorkspace(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const examId = typeof src.examId === "string" && src.examId.trim() ? src.examId.trim() : null;
  const schoolSection = normalizeSchoolSection(src.schoolSection || "ALL");
  return { examId, schoolSection };
}

/**
 * Resolve working exam + section.
 * Precedence: query/request override > stored preference > catalog default (latest exam).
 */
export async function resolveWorkspace({
  userId,
  examId: overrideExamId,
  schoolSection: overrideSection,
  stored,
} = {}) {
  let preference = stored != null ? normalizeWorkspace(stored) : null;
  if (!preference && userId) {
    await ensureUserWorkspaceColumn();
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { workspace: true },
    });
    preference = normalizeWorkspace(row?.workspace);
  }
  preference = preference || normalizeWorkspace(null);

  const sectionOverride =
    overrideSection != null && String(overrideSection).trim() !== ""
      ? normalizeSchoolSection(overrideSection)
      : null;
  const schoolSection = sectionOverride || preference.schoolSection || "ALL";

  const wantExamId =
    (typeof overrideExamId === "string" && overrideExamId.trim()) ||
    preference.examId ||
    null;

  const { exams, exam } = await loadExams(wantExamId || undefined);
  return {
    examId: exam?.id || null,
    exam: exam || null,
    exams,
    schoolSection,
    preference,
    fromPreference: Boolean(preference.examId && exam?.id === preference.examId),
  };
}

/** Persist workspace preference for a user (partial update). */
export async function saveWorkspace(userId, patch = {}) {
  await ensureUserWorkspaceColumn();
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { workspace: true },
  });
  const current = normalizeWorkspace(row?.workspace);
  const next = { ...current };

  if ("examId" in patch) {
    const id = patch.examId;
    next.examId = typeof id === "string" && id.trim() ? id.trim() : null;
  }
  if ("schoolSection" in patch) {
    next.schoolSection = normalizeSchoolSection(patch.schoolSection || "ALL");
  }

  // Validate exam exists when set
  if (next.examId) {
    const exam = await prisma.exam.findUnique({
      where: { id: next.examId },
      select: { id: true },
    });
    if (!exam) {
      const err = new Error("Exam not found");
      err.status = 404;
      err.code = "EXAM_NOT_FOUND";
      throw err;
    }
  }

  const payload = {
    examId: next.examId,
    schoolSection: next.schoolSection,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { workspace: payload },
  });

  return resolveWorkspace({
    userId,
    stored: payload,
  });
}

export function publicWorkspace(resolved) {
  if (!resolved) return { examId: null, schoolSection: "ALL", exam: null };
  return {
    examId: resolved.examId,
    schoolSection: resolved.schoolSection,
    exam: resolved.exam
      ? {
          id: resolved.exam.id,
          name: resolved.exam.name,
          academicYear: resolved.exam.academicYear,
          type: resolved.exam.type,
          date: resolved.exam.date,
          marksEntryDeadline: resolved.exam.marksEntryDeadline ?? null,
        }
      : null,
  };
}
