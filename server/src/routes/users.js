import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { auth, publicUser, requireRole } from "../middleware/auth.js";

export const usersRouter = Router();
usersRouter.use(auth);

usersRouter.get("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const status = req.query.status;
  const users = await prisma.user.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      assignments: { include: { classSection: true, subject: true } },
    },
  });
  res.json(
    users.map((u) => ({
      ...publicUser(u),
      createdAt: u.createdAt,
      assignments: u.assignments,
    }))
  );
});

usersRouter.post("/", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { name, email, schoolId, password, role, status, assignments } = req.body || {};
  if (!name || !password) {
    return res.status(400).json({ error: "Name and password are required" });
  }
  if (!email && !schoolId) {
    return res.status(400).json({ error: "Provide an email or school ID" });
  }

  let chosenRole = ["TEACHER", "EXAM_COORDINATOR", "PRINCIPAL"].includes(role) ? role : "TEACHER";
  if (req.user.role === "EXAM_COORDINATOR" && chosenRole !== "TEACHER") {
    return res.status(403).json({ error: "Only the principal can add an exam coordinator" });
  }
  if (chosenRole === "PRINCIPAL") {
    return res.status(403).json({ error: "Principal accounts cannot be created here" });
  }

  if (email) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "Email already registered" });
  }
  if (schoolId) {
    const exists = await prisma.user.findUnique({ where: { schoolId } });
    if (exists) return res.status(409).json({ error: "School ID already registered" });
  }

  const chosenStatus = status === "PENDING" || status === "REJECTED" ? status : "ACTIVE";

  const user = await prisma.user.create({
    data: {
      name,
      email: email || null,
      schoolId: schoolId || null,
      passwordHash: await bcrypt.hash(password, 10),
      role: chosenRole,
      status: chosenStatus,
    },
  });

  if (Array.isArray(assignments) && assignments.length) {
    await prisma.teacherAssignment.createMany({
      data: assignments.map((a) => ({
        userId: user.id,
        classSectionId: a.classSectionId,
        subjectId: a.subjectId,
      })),
      skipDuplicates: true,
    });
  }

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    include: { assignments: { include: { classSection: true, subject: true } } },
  });
  res.status(201).json({ ...publicUser(fresh), assignments: fresh.assignments });
});

usersRouter.patch("/:id", requireRole("PRINCIPAL", "EXAM_COORDINATOR"), async (req, res) => {
  const { status, role, assignments } = req.body || {};
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (role === "PRINCIPAL" && req.user.role !== "PRINCIPAL") {
    return res.status(403).json({ error: "Only a principal can assign the principal role" });
  }
  if (req.user.role === "EXAM_COORDINATOR" && (role === "EXAM_COORDINATOR" || role === "PRINCIPAL")) {
    return res.status(403).json({ error: "Only the principal can change leadership roles" });
  }
  if (existing.role === "PRINCIPAL" && role && role !== "PRINCIPAL") {
    const otherPrincipals = await prisma.user.count({
      where: { role: "PRINCIPAL", status: "ACTIVE", id: { not: existing.id } },
    });
    if (otherPrincipals === 0) {
      return res.status(400).json({ error: "Cannot demote the only active principal" });
    }
  }

  const data = {};
  if (status && ["PENDING", "ACTIVE", "REJECTED"].includes(status)) data.status = status;
  if (role && ["PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"].includes(role)) data.role = role;

  const user = Object.keys(data).length
    ? await prisma.user.update({ where: { id: req.params.id }, data })
    : existing;

  if (Array.isArray(assignments)) {
    await prisma.teacherAssignment.deleteMany({ where: { userId: user.id } });
    if (assignments.length) {
      await prisma.teacherAssignment.createMany({
        data: assignments.map((a) => ({
          userId: user.id,
          classSectionId: a.classSectionId,
          subjectId: a.subjectId,
        })),
        skipDuplicates: true,
      });
    }
  }

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    include: { assignments: { include: { classSection: true, subject: true } } },
  });
  res.json({ ...publicUser(fresh), assignments: fresh.assignments });
});

usersRouter.post("/:id/reset-password", requireRole("PRINCIPAL"), async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.user.update({
    where: { id: existing.id },
    data: { passwordHash: await bcrypt.hash(String(password), 10) },
  });
  res.json({ ok: true, message: "Password reset" });
});
