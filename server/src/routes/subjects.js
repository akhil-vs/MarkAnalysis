import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { assertMaxMarksEditable } from "../lib/consolidationMaxMarks.js";
import { ensureConsolidationSchema } from "../lib/ensureSchema.js";
import { auth, requireRole } from "../middleware/auth.js";

export const subjectsRouter = Router();
subjectsRouter.use(auth);

subjectsRouter.get("/", async (req, res) => {
  const className = req.query.className;
  const subjects = await prisma.subject.findMany({
    where: className ? { className } : undefined,
    orderBy: [{ className: "asc" }, { name: "asc" }],
  });
  res.json(subjects);
});

subjectsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, className, maxMarks } = req.body || {};
  if (!name || !className || !maxMarks) {
    return res.status(400).json({ error: "Name, class, and max marks are required" });
  }
  try {
    await ensureConsolidationSchema();
    const created = await prisma.subject.create({
      data: { name, className, maxMarks: Number(maxMarks) },
    });
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "Subject already exists for this class" });
  }
});

subjectsRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, className, maxMarks } = req.body || {};
  if (maxMarks != null) {
    await ensureConsolidationSchema();
    const lockedMsg = await assertMaxMarksEditable();
    if (lockedMsg) return res.status(409).json({ error: lockedMsg });
  }
  const updated = await prisma.subject.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(className && { className }),
      ...(maxMarks != null && { maxMarks: Number(maxMarks) }),
    },
  });
  res.json(updated);
});

subjectsRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
