import { auditValueFor, parseMarkInput } from "./markCodes.js";
import { mutateBlockFromAccess } from "./markAccess.js";
import { studentTakesSubject } from "./electiveEnrollment.js";

/**
 * Deduplicate register cells (last write wins) and drop incomplete rows.
 */
export function normalizeMarkEntries(entries) {
  const byKey = new Map();
  for (const entry of entries || []) {
    if (!entry?.studentId || !entry?.subjectId) continue;
    byKey.set(`${entry.studentId}:${entry.subjectId}`, entry);
  }
  return [...byKey.values()];
}

/**
 * Plan mark mutations from prefetched maps — no DB I/O.
 * @param {object} args
 * @param {Array} args.entries normalized entries
 * @param {Map} args.studentMap id -> student
 * @param {Map} args.subjectMap id -> subject
 * @param {Map} args.markMap `${studentId}:${subjectId}` -> existing mark
 * @param {Set|null} args.writableKeys `${classSectionId}:${subjectId}` for teachers; null = all writable
 * @param {object|null} args.accessBySubject entryAccess.bySubject map for teachers
 * @param {Set|null} args.enrollmentKeys elective `${studentId}:${subjectId}` pairs
 */
export function planMarkMutations({
  entries,
  studentMap,
  subjectMap,
  markMap,
  writableKeys = null,
  accessBySubject = null,
  enrollmentKeys = null,
}) {
  const plans = [];
  const keys = enrollmentKeys instanceof Set ? enrollmentKeys : new Set();

  for (const entry of entries) {
    const { studentId, subjectId, marksObtained } = entry;
    const student = studentMap.get(studentId);
    const subject = subjectMap.get(subjectId);
    if (!student || !subject) {
      plans.push({
        type: "error",
        studentId,
        subjectId,
        error: "Student or subject not found",
      });
      continue;
    }

    if (subject.isElective && !studentTakesSubject(subject, studentId, keys)) {
      plans.push({
        type: "error",
        studentId,
        subjectId,
        error: "Student not enrolled in elective",
      });
      continue;
    }

    if (writableKeys) {
      const key = `${student.classSectionId}:${subjectId}`;
      if (!writableKeys.has(key)) {
        plans.push({ type: "error", studentId, subjectId, error: "Not assigned" });
        continue;
      }
    }

    const existing = markMap.get(`${studentId}:${subjectId}`) || null;

    if (accessBySubject) {
      const blocked = mutateBlockFromAccess(accessBySubject[subjectId], existing?.status);
      if (blocked) {
        plans.push({ type: "error", studentId, subjectId, error: blocked });
        continue;
      }
    }

    const parsed = parseMarkInput(marksObtained, subject.maxMarks);
    if (parsed.empty) {
      if (!existing) {
        plans.push({ type: "noop", studentId, subjectId, deleted: true });
        continue;
      }
      plans.push({
        type: "delete",
        studentId,
        subjectId,
        existing,
        auditOld: auditValueFor(existing.outcome, existing.marksObtained),
      });
      continue;
    }
    if (parsed.error) {
      plans.push({ type: "error", studentId, subjectId, error: parsed.error });
      continue;
    }

    const sameScore =
      existing &&
      existing.outcome === parsed.outcome &&
      existing.marksObtained === parsed.marksObtained;
    if (sameScore) {
      plans.push({ type: "unchanged", studentId, subjectId, mark: existing });
      continue;
    }

    plans.push({
      type: "upsert",
      studentId,
      subjectId,
      existing,
      parsed,
      auditOld: existing ? auditValueFor(existing.outcome, existing.marksObtained) : null,
      auditNew: auditValueFor(parsed.outcome, parsed.marksObtained),
    });
  }

  return plans;
}

export function resultFromPlan(plan, mark) {
  if (plan.type === "error") {
    return { studentId: plan.studentId, subjectId: plan.subjectId, error: plan.error };
  }
  if (plan.type === "noop" || plan.type === "delete") {
    return { studentId: plan.studentId, subjectId: plan.subjectId, deleted: true };
  }
  if (plan.type === "unchanged") {
    return { studentId: plan.studentId, subjectId: plan.subjectId, mark: plan.mark, unchanged: true };
  }
  return { studentId: plan.studentId, subjectId: plan.subjectId, mark };
}

/** Run async work in parallel chunks to cut wall-clock time on remote DBs. */
export async function mapInChunks(items, chunkSize, mapper) {
  const out = [];
  const size = Math.max(1, chunkSize | 0);
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const part = await Promise.all(chunk.map(mapper));
    out.push(...part);
  }
  return out;
}

/**
 * Apply planned mark mutations with fewer DB round-trips:
 * - deletes: one createMany audits + one deleteMany
 * - creates: createMany + createMany audits
 * - updates: parallel chunked updates + createMany audits per chunk
 */
export async function applyMarkPlans(prismaClient, { examId, userId, plans, chunkSize = 40 }) {
  const results = new Array(plans.length);
  const toDelete = [];
  const toCreate = [];
  const toUpdate = [];

  plans.forEach((plan, index) => {
    if (plan.type === "error" || plan.type === "unchanged" || plan.type === "noop") {
      results[index] = resultFromPlan(plan);
      return;
    }
    if (plan.type === "delete") {
      toDelete.push({ plan, index });
      return;
    }
    if (plan.existing) toUpdate.push({ plan, index });
    else toCreate.push({ plan, index });
  });

  if (toDelete.length) {
    await prismaClient.$transaction([
      prismaClient.markAudit.createMany({
        data: toDelete.map(({ plan }) => ({
          markId: plan.existing.id,
          changedById: userId,
          oldValue: plan.auditOld,
          newValue: -1,
        })),
      }),
      prismaClient.mark.deleteMany({
        where: { id: { in: toDelete.map(({ plan }) => plan.existing.id) } },
      }),
    ]);
    for (const { plan, index } of toDelete) {
      results[index] = resultFromPlan(plan);
    }
  }

  if (toCreate.length) {
    await prismaClient.mark.createMany({
      data: toCreate.map(({ plan }) => ({
        studentId: plan.studentId,
        subjectId: plan.subjectId,
        examId,
        marksObtained: plan.parsed.marksObtained,
        outcome: plan.parsed.outcome,
        enteredById: userId,
        status: "DRAFT",
      })),
    });
    const created = await prismaClient.mark.findMany({
      where: {
        examId,
        OR: toCreate.map(({ plan }) => ({
          studentId: plan.studentId,
          subjectId: plan.subjectId,
        })),
      },
    });
    const createdMap = new Map(created.map((m) => [`${m.studentId}:${m.subjectId}`, m]));
    await prismaClient.markAudit.createMany({
      data: toCreate.map(({ plan }) => {
        const mark = createdMap.get(`${plan.studentId}:${plan.subjectId}`);
        return {
          markId: mark.id,
          changedById: userId,
          oldValue: plan.auditOld,
          newValue: plan.auditNew,
        };
      }),
    });
    for (const { plan, index } of toCreate) {
      results[index] = resultFromPlan(plan, createdMap.get(`${plan.studentId}:${plan.subjectId}`));
    }
  }

  if (toUpdate.length) {
    const size = Math.max(1, chunkSize | 0);
    for (let i = 0; i < toUpdate.length; i += size) {
      const chunk = toUpdate.slice(i, i + size);
      const marks = await Promise.all(
        chunk.map(({ plan }) =>
          prismaClient.mark.update({
            where: { id: plan.existing.id },
            data: {
              marksObtained: plan.parsed.marksObtained,
              outcome: plan.parsed.outcome,
              enteredById: userId,
              status: "DRAFT",
            },
          })
        )
      );
      await prismaClient.markAudit.createMany({
        data: chunk.map(({ plan }, j) => ({
          markId: marks[j].id,
          changedById: userId,
          oldValue: plan.auditOld,
          newValue: plan.auditNew,
        })),
      });
      chunk.forEach(({ plan, index }, j) => {
        results[index] = resultFromPlan(plan, marks[j]);
      });
    }
  }

  return results;
}

