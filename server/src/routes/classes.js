import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, getTeacherClassIds, requireRole } from "../middleware/auth.js";
import { compareClassNames } from "../lib/stats.js";
import { requireSchoolTenant } from "../lib/tenant.js";

export const classesRouter = Router();
classesRouter.use(auth);
classesRouter.use(requireSchoolTenant);

function sortClasses(classes) {
  return [...classes].sort((a, b) => {
    const byClass = compareClassNames(a.className, b.className);
    if (byClass) return byClass;
    return compareClassNames(a.section, b.section);
  });
}

classesRouter.get("/", async (req, res) => {
  const where = {};
  if (req.user.role === "TEACHER") {
    const ids = await getTeacherClassIds(req.user.userId);
    if (!ids.length) return res.json([]);
    where.id = { in: ids };
  }

  const classes = await prisma.classSection.findMany({
    where,
    include: {
      classTeacher: { select: { id: true, name: true } },
      _count: { select: { students: { where: { status: "ACTIVE" } } } },
    },
  });
  res.json(sortClasses(classes));
});

/**
 * Create many divisions for one class in a single request.
 * Body: { className, divisions: [{ section, classTeacherId? }] }
 */
classesRouter.post("/batch", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const className = String(req.body?.className || "").trim();
  const rawDivisions = Array.isArray(req.body?.divisions) ? req.body.divisions : null;
  if (!className) {
    return res.status(400).json({ error: "Class is required" });
  }
  if (!rawDivisions?.length) {
    return res.status(400).json({ error: "Add at least one division" });
  }

  const divisions = [];
  const seen = new Set();
  for (const row of rawDivisions) {
    const section = String(row?.section || "").trim();
    if (!section) {
      return res.status(400).json({ error: "Each division needs a section" });
    }
    const key = section.toLowerCase();
    if (seen.has(key)) {
      return res.status(400).json({ error: `Duplicate section “${section}”` });
    }
    seen.add(key);
    const classTeacherId = String(row?.classTeacherId || "").trim() || null;
    divisions.push({ section, classTeacherId });
  }

  const teacherIds = [...new Set(divisions.map((d) => d.classTeacherId).filter(Boolean))];
  if (teacherIds.length) {
    const teachers = await prisma.user.findMany({
      where: { id: { in: teacherIds }, role: "TEACHER", status: "ACTIVE" },
      select: { id: true },
    });
    if (teachers.length !== teacherIds.length) {
      return res.status(400).json({ error: "One or more class teachers are invalid" });
    }
  }

  const existing = await prisma.classSection.findMany({
    where: {
      className,
      section: { in: divisions.map((d) => d.section) },
    },
    select: { section: true },
  });
  if (existing.length) {
    const labels = existing.map((e) => `${className}-${e.section}`).join(", ");
    return res.status(409).json({ error: `Already exists: ${labels}` });
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const division of divisions) {
      const row = await tx.classSection.create({
        data: {
          className,
          section: division.section,
          classTeacherId: division.classTeacherId,
          tenantId: req.tenantId,
        },
        include: {
          classTeacher: { select: { id: true, name: true } },
          _count: { select: { students: { where: { status: "ACTIVE" } } } },
        },
      });
      rows.push(row);
    }
    return rows;
  });

  res.status(201).json(sortClasses(created));
});

classesRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { className, section, classTeacherId } = req.body || {};
  if (!className || !section) {
    return res.status(400).json({ error: "Class and section are required" });
  }
  const created = await prisma.classSection.create({
    data: { className, section, classTeacherId: classTeacherId || null, tenantId: req.tenantId },
  });
  res.status(201).json(created);
});

classesRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { className, section, classTeacherId } = req.body || {};
  const updated = await prisma.classSection.update({
    where: { id: req.params.id },
    data: {
      ...(className && { className }),
      ...(section && { section }),
      classTeacherId: classTeacherId === undefined ? undefined : classTeacherId || null,
    },
  });
  res.json(updated);
});

classesRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const existing = await prisma.classSection.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Class section not found" });

  await prisma.classSection.delete({ where: { id: req.params.id } });

  // Subjects are keyed by className (not FK). When the last section for a class
  // is removed, drop unused subject rows so Exams does not list ghost classes.
  const remaining = await prisma.classSection.count({ where: { className: existing.className } });
  let removedSubjects = 0;
  if (remaining === 0) {
    const orphans = await prisma.subject.findMany({ where: { className: existing.className } });
    for (const subject of orphans) {
      const [markCount, assignmentCount, timetableCount, enrollmentCount, scheduleCount] =
        await Promise.all([
          prisma.mark.count({ where: { subjectId: subject.id } }),
          prisma.teacherAssignment.count({ where: { subjectId: subject.id } }),
          prisma.timetableEntry.count({ where: { subjectId: subject.id } }),
          prisma.studentSubjectEnrollment.count({ where: { subjectId: subject.id } }),
          prisma.examPaperSchedule.count({ where: { subjectId: subject.id } }),
        ]);
      if (markCount || assignmentCount || timetableCount || enrollmentCount || scheduleCount) {
        continue;
      }
      await prisma.subject.delete({ where: { id: subject.id } });
      removedSubjects += 1;
    }
  }

  res.json({ ok: true, removedSubjects });
});
