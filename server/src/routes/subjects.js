import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ensureConsolidationSchema, ensureSubjectPoolSchema } from "../lib/ensureSchema.js";
import { parseOptionalPositiveInt, parsePositiveInt } from "../lib/numbers.js";
import { auth, requireFeature, requireRole } from "../middleware/auth.js";
import { requireSchoolTenant } from "../lib/tenant.js";

export const subjectsRouter = Router();
subjectsRouter.use(auth);
subjectsRouter.use(requireSchoolTenant);

const requireRecordsWrite = [requireRole("PRINCIPAL", "EXAM_COORDINATOR"), requireFeature("records")];

async function ensureSubjectSchemas() {
  await ensureConsolidationSchema();
  await ensureSubjectPoolSchema();
}

function parseSubjectFields(body = {}) {
  const name = String(body.name || "").trim();
  if (!name) return { error: "Name is required" };
  const entry = parsePositiveInt(body.maxMarks, "Max marks");
  if (entry.error) return { error: entry.error };
  const practical = parseOptionalPositiveInt(body.practicalMaxMarks, "Practical max marks");
  if (practical.error) return { error: practical.error };
  let category = null;
  if (body.category !== undefined && body.category !== null && body.category !== "") {
    category = String(body.category).trim().toUpperCase().slice(0, 40) || null;
  }
  return {
    name,
    maxMarks: entry.value,
    practicalMaxMarks: practical.value,
    isElective: Boolean(body.isElective),
    category,
  };
}

/** Backfill the school pool from existing class subjects (unique by name). */
async function backfillPoolFromSubjects(tenantId) {
  const existing = await prisma.subjectPoolItem.count();
  if (existing > 0) return;

  const subjects = await prisma.subject.findMany({
    orderBy: [{ name: "asc" }, { className: "asc" }],
  });
  const byName = new Map();
  for (const subject of subjects) {
    if (!byName.has(subject.name)) {
      byName.set(subject.name, subject);
    }
  }
  if (!byName.size) return;

  await prisma.subjectPoolItem.createMany({
    data: [...byName.values()].map((s) => ({
      name: s.name,
      maxMarks: s.maxMarks,
      isElective: Boolean(s.isElective),
      practicalMaxMarks: s.practicalMaxMarks ?? null,
      category: s.category ?? null,
      tenantId,
    })),
    skipDuplicates: true,
  });
}

async function upsertPoolItemFromSubject(tenantId, fields) {
  const existing = await prisma.subjectPoolItem.findFirst({
    where: { name: fields.name },
  });
  if (existing) {
    return prisma.subjectPoolItem.update({
      where: { id: existing.id },
      data: {
        maxMarks: fields.maxMarks,
        isElective: fields.isElective,
        practicalMaxMarks: fields.practicalMaxMarks,
        ...(fields.category !== undefined ? { category: fields.category } : {}),
      },
    });
  }
  return prisma.subjectPoolItem.create({
    data: {
      name: fields.name,
      maxMarks: fields.maxMarks,
      isElective: fields.isElective,
      practicalMaxMarks: fields.practicalMaxMarks,
      category: fields.category ?? null,
      tenantId,
    },
  });
}

subjectsRouter.get("/", async (req, res) => {
  await ensureSubjectSchemas();
  const className = req.query.className;
  const subjects = await prisma.subject.findMany({
    where: className ? { className: String(className) } : undefined,
    orderBy: [{ className: "asc" }, { name: "asc" }],
  });
  res.json(subjects);
});

subjectsRouter.get("/pool", requireRole("PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"), async (req, res) => {
  await ensureSubjectSchemas();
  await backfillPoolFromSubjects(req.tenantId);
  const items = await prisma.subjectPoolItem.findMany({
    orderBy: [{ name: "asc" }],
  });
  res.json(items);
});

subjectsRouter.post("/pool", ...requireRecordsWrite, async (req, res) => {
  await ensureSubjectSchemas();
  const fields = parseSubjectFields(req.body || {});
  if (fields.error) return res.status(400).json({ error: fields.error });

  const duplicate = await prisma.subjectPoolItem.findFirst({ where: { name: fields.name } });
  if (duplicate) {
    return res.status(409).json({ error: `Pool already has “${fields.name}”` });
  }

  const created = await prisma.subjectPoolItem.create({
    data: {
      name: fields.name,
      maxMarks: fields.maxMarks,
      isElective: fields.isElective,
      practicalMaxMarks: fields.practicalMaxMarks,
      category: fields.category ?? null,
      tenantId: req.tenantId,
    },
  });
  res.status(201).json(created);
});

subjectsRouter.patch("/pool/:id", ...requireRecordsWrite, async (req, res) => {
  await ensureSubjectSchemas();
  const existing = await prisma.subjectPoolItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Pool subject not found" });

  const data = {};
  if (req.body?.name != null) {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (name !== existing.name) {
      const clash = await prisma.subjectPoolItem.findFirst({ where: { name } });
      if (clash) return res.status(409).json({ error: `Pool already has “${name}”` });
    }
    data.name = name;
  }
  if (req.body?.maxMarks != null && req.body.maxMarks !== "") {
    const entry = parsePositiveInt(req.body.maxMarks, "Max marks");
    if (entry.error) return res.status(400).json({ error: entry.error });
    data.maxMarks = entry.value;
  }
  if (typeof req.body?.isElective === "boolean") {
    data.isElective = req.body.isElective;
  }
  if (req.body?.practicalMaxMarks !== undefined) {
    const practical = parseOptionalPositiveInt(req.body.practicalMaxMarks, "Practical max marks");
    if (practical.error) return res.status(400).json({ error: practical.error });
    data.practicalMaxMarks = practical.value;
  }
  if (req.body?.category !== undefined) {
    const text = req.body.category == null || req.body.category === ""
      ? null
      : String(req.body.category).trim().toUpperCase().slice(0, 40) || null;
    data.category = text;
  }

  const updated = await prisma.subjectPoolItem.update({
    where: { id: existing.id },
    data,
  });

  // Keep class subject marks in step when the pool definition changes.
  const syncName = data.name || existing.name;
  const classSubjectData = {};
  if (data.maxMarks != null) classSubjectData.maxMarks = data.maxMarks;
  if (data.practicalMaxMarks !== undefined) classSubjectData.practicalMaxMarks = data.practicalMaxMarks;
  if (typeof data.isElective === "boolean") classSubjectData.isElective = data.isElective;
  if (data.name && data.name !== existing.name) classSubjectData.name = data.name;

  if (Object.keys(classSubjectData).length) {
    await prisma.subject.updateMany({
      where: { name: existing.name },
      data: classSubjectData,
    });
  }

  res.json({ ...updated, syncedClassName: syncName });
});

subjectsRouter.delete("/pool/:id", ...requireRecordsWrite, async (req, res) => {
  await ensureSubjectSchemas();
  const existing = await prisma.subjectPoolItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Pool subject not found" });
  await prisma.subjectPoolItem.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

subjectsRouter.get("/for-class/:className", requireRole("PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"), async (req, res) => {
  await ensureSubjectSchemas();
  await backfillPoolFromSubjects(req.tenantId);
  const className = String(req.params.className || "").trim();
  if (!className) return res.status(400).json({ error: "Class is required" });

  const [pool, subjects] = await Promise.all([
    prisma.subjectPoolItem.findMany({ orderBy: [{ name: "asc" }] }),
    prisma.subject.findMany({
      where: { className },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  const selectedByName = new Map(subjects.map((s) => [s.name, s]));
  const selectedPoolIds = pool.filter((p) => selectedByName.has(p.name)).map((p) => p.id);

  res.json({ className, pool, subjects, selectedPoolIds });
});

subjectsRouter.put("/for-class/:className", ...requireRecordsWrite, async (req, res) => {
  await ensureSubjectSchemas();
  const className = String(req.params.className || "").trim();
  if (!className) return res.status(400).json({ error: "Class is required" });

  const rawIds = req.body?.poolItemIds;
  if (!Array.isArray(rawIds)) {
    return res.status(400).json({ error: "poolItemIds array is required" });
  }
  const poolItemIds = [...new Set(rawIds.map((id) => String(id)).filter(Boolean))];

  const [poolItems, existingSubjects] = await Promise.all([
    poolItemIds.length
      ? prisma.subjectPoolItem.findMany({ where: { id: { in: poolItemIds } } })
      : Promise.resolve([]),
    prisma.subject.findMany({ where: { className } }),
  ]);

  if (poolItems.length !== poolItemIds.length) {
    return res.status(400).json({ error: "One or more pool subjects were not found" });
  }

  const selectedNames = new Set(poolItems.map((p) => p.name));
  const created = [];
  const updated = [];
  const removed = [];
  const keptWithData = [];

  await prisma.$transaction(async (tx) => {
    for (const item of poolItems) {
      const current = existingSubjects.find((s) => s.name === item.name);
      if (current) {
        const next = await tx.subject.update({
          where: { id: current.id },
          data: {
            maxMarks: item.maxMarks,
            isElective: item.isElective,
            practicalMaxMarks: item.practicalMaxMarks,
            category: item.category ?? null,
          },
        });
        updated.push(next);
      } else {
        const next = await tx.subject.create({
          data: {
            name: item.name,
            className,
            maxMarks: item.maxMarks,
            isElective: item.isElective,
            practicalMaxMarks: item.practicalMaxMarks,
            category: item.category ?? null,
            tenantId: req.tenantId,
          },
        });
        created.push(next);
      }
    }

    for (const subject of existingSubjects) {
      if (selectedNames.has(subject.name)) continue;

      const [markCount, assignmentCount, timetableCount, enrollmentCount, scheduleCount] =
        await Promise.all([
          tx.mark.count({ where: { subjectId: subject.id } }),
          tx.teacherAssignment.count({ where: { subjectId: subject.id } }),
          tx.timetableEntry.count({ where: { subjectId: subject.id } }),
          tx.studentSubjectEnrollment.count({ where: { subjectId: subject.id } }),
          tx.examPaperSchedule.count({ where: { subjectId: subject.id } }),
        ]);

      if (markCount || assignmentCount || timetableCount || enrollmentCount || scheduleCount) {
        keptWithData.push({
          id: subject.id,
          name: subject.name,
          reason: "Has marks, assignments, timetable, enrollments, or paper dates",
        });
        continue;
      }

      await tx.subject.delete({ where: { id: subject.id } });
      removed.push({ id: subject.id, name: subject.name });
    }
  });

  const subjects = await prisma.subject.findMany({
    where: { className },
    orderBy: [{ name: "asc" }],
  });

  res.json({
    className,
    subjects,
    created: created.length,
    updated: updated.length,
    removed: removed.length,
    keptWithData,
  });
});

subjectsRouter.post("/", ...requireRecordsWrite, async (req, res) => {
  const { name, className, maxMarks, isElective, practicalMaxMarks } = req.body || {};
  if (!name || !className) {
    return res.status(400).json({ error: "Name and class are required" });
  }
  const entry = parsePositiveInt(maxMarks, "Max marks");
  if (entry.error) return res.status(400).json({ error: entry.error });
  const practical = parseOptionalPositiveInt(practicalMaxMarks, "Practical max marks");
  if (practical.error) return res.status(400).json({ error: practical.error });

  await ensureSubjectSchemas();
  const fields = {
    name: String(name).trim(),
    maxMarks: entry.value,
    isElective: Boolean(isElective),
    practicalMaxMarks: practical.value,
  };
  const created = await prisma.subject.create({
    data: {
      name: fields.name,
      className: String(className).trim(),
      maxMarks: fields.maxMarks,
      tenantId: req.tenantId,
      ...(typeof isElective === "boolean" ? { isElective } : {}),
      practicalMaxMarks: fields.practicalMaxMarks,
    },
  });
  await upsertPoolItemFromSubject(req.tenantId, {
    name: fields.name,
    maxMarks: fields.maxMarks,
    isElective: typeof isElective === "boolean" ? isElective : false,
    practicalMaxMarks: fields.practicalMaxMarks,
  });
  res.status(201).json(created);
});

subjectsRouter.patch("/:id", ...requireRecordsWrite, async (req, res) => {
  const { name, className, maxMarks, isElective, practicalMaxMarks } = req.body || {};
  await ensureSubjectSchemas();

  const data = {
    ...(name && { name: String(name).trim() }),
    ...(className && { className: String(className).trim() }),
    ...(typeof isElective === "boolean" ? { isElective } : {}),
  };

  if (maxMarks != null && maxMarks !== "") {
    const entry = parsePositiveInt(maxMarks, "Max marks");
    if (entry.error) return res.status(400).json({ error: entry.error });
    data.maxMarks = entry.value;
  }

  if (practicalMaxMarks !== undefined) {
    const practical = parseOptionalPositiveInt(practicalMaxMarks, "Practical max marks");
    if (practical.error) return res.status(400).json({ error: practical.error });
    data.practicalMaxMarks = practical.value;
  }

  const updated = await prisma.subject.update({
    where: { id: req.params.id },
    data,
  });

  if (data.name || data.maxMarks != null || data.practicalMaxMarks !== undefined || typeof data.isElective === "boolean") {
    await upsertPoolItemFromSubject(req.tenantId, {
      name: updated.name,
      maxMarks: updated.maxMarks,
      isElective: Boolean(updated.isElective),
      practicalMaxMarks: updated.practicalMaxMarks ?? null,
    });
  }

  res.json(updated);
});

subjectsRouter.get("/:id/enrollments", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await ensureSubjectSchemas();
  const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });

  const rows = await prisma.studentSubjectEnrollment.findMany({
    where: { subjectId: subject.id },
    select: { studentId: true },
  });
  res.json({ studentIds: rows.map((r) => r.studentId) });
});

subjectsRouter.put("/:id/enrollments", ...requireRecordsWrite, async (req, res) => {
  await ensureSubjectSchemas();
  const subject = await prisma.subject.findUnique({ where: { id: req.params.id } });
  if (!subject) return res.status(404).json({ error: "Subject not found" });
  if (!subject.isElective) {
    return res.status(400).json({ error: "Subject is not elective" });
  }

  const rawIds = req.body?.studentIds;
  if (!Array.isArray(rawIds)) {
    return res.status(400).json({ error: "studentIds array is required" });
  }
  const studentIds = [...new Set(rawIds.map((id) => String(id)).filter(Boolean))];

  if (studentIds.length) {
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { classSection: { select: { className: true } } },
    });
    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: "One or more students not found" });
    }
    const mismatched = students.filter((s) => s.classSection?.className !== subject.className);
    if (mismatched.length) {
      return res.status(400).json({ error: "Students must belong to the subject's class" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.studentSubjectEnrollment.deleteMany({ where: { subjectId: subject.id } });
    if (studentIds.length) {
      await tx.studentSubjectEnrollment.createMany({
        data: studentIds.map((studentId) => ({ studentId, subjectId: subject.id })),
      });
    }
  });

  res.json({ studentIds });
});

subjectsRouter.delete("/:id", ...requireRecordsWrite, async (req, res) => {
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
