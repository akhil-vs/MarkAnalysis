import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole } from "../middleware/auth.js";

export const classesRouter = Router();
classesRouter.use(auth);

classesRouter.get("/", async (req, res) => {
  const classes = await prisma.classSection.findMany({
    orderBy: [{ className: "asc" }, { section: "asc" }],
    include: {
      classTeacher: { select: { id: true, name: true } },
      _count: { select: { students: true } },
    },
  });
  res.json(classes);
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
