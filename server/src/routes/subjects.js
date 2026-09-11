import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ensureConsolidationSchema } from "../lib/ensureSchema.js";
import { parsePositiveInt } from "../lib/numbers.js";
import { auth, requireRole } from "../middleware/auth.js";

export const subjectsRouter = Router();
subjectsRouter.use(auth);

subjectsRouter.get("/", async (req, res) => {
  await ensureConsolidationSchema();
  const className = req.query.className;
  const subjects = await prisma.subject.findMany({
    where: className ? { className } : undefined,
    orderBy: [{ className: "asc" }, { name: "asc" }],
  });
  res.json(subjects);
});

subjectsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, className, maxMarks } = req.body || {};
  if (!name || !className) {
    return res.status(400).json({ error: "Name and class are required" });
  }
  const entry = parsePositiveInt(maxMarks, "Max marks");
  if (entry.error) return res.status(400).json({ error: entry.error });

  try {
    await ensureConsolidationSchema();
    const created = await prisma.subject.create({
      data: {
        name,
        className,
        maxMarks: entry.value,
      },
    });
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "Subject already exists for this class" });
  }
});

subjectsRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, className, maxMarks } = req.body || {};
  await ensureConsolidationSchema();

  const data = {
    ...(name && { name }),
    ...(className && { className }),
  };

  if (maxMarks != null) {
    const entry = parsePositiveInt(maxMarks, "Max marks");
    if (entry.error) return res.status(400).json({ error: entry.error });
    data.maxMarks = entry.value;
  }

  const updated = await prisma.subject.update({
    where: { id: req.params.id },
    data,
  });
  res.json(updated);
});

subjectsRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
