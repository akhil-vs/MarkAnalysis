import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, getTeacherClassIds, requireRole } from "../middleware/auth.js";
import { compareClassNames } from "../lib/stats.js";

export const classesRouter = Router();
classesRouter.use(auth);

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

classesRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { className, section, classTeacherId } = req.body || {};
  if (!className || !section) {
    return res.status(400).json({ error: "Class and section are required" });
  }
  try {
    const created = await prisma.classSection.create({
      data: { className, section, classTeacherId: classTeacherId || null },
    });
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "Class section already exists" });
  }
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
  await prisma.classSection.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
