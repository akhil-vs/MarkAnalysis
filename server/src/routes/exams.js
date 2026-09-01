import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auth, requireRole } from "../middleware/auth.js";

export const examsRouter = Router();
examsRouter.use(auth);

examsRouter.get("/", async (_req, res) => {
  const exams = await prisma.exam.findMany({ orderBy: { date: "asc" } });
  res.json(exams);
});

examsRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, term, date, type } = req.body || {};
  if (!name || !term || !date || !type) {
    return res.status(400).json({ error: "Name, term, date, and type are required" });
  }
  const created = await prisma.exam.create({
    data: { name, term, date: new Date(date), type },
  });
  res.status(201).json(created);
});

examsRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, term, date, type } = req.body || {};
  const updated = await prisma.exam.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(term && { term }),
      ...(date && { date: new Date(date) }),
      ...(type && { type }),
    },
  });
  res.json(updated);
});

examsRouter.delete("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  await prisma.exam.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
