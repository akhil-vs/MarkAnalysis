import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { auth, publicUser, signToken } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const { name, email, schoolId, password, role } = req.body || {};
  if (!name || !password) {
    return res.status(400).json({ error: "Name and password are required" });
  }
  if (!email && !schoolId) {
    return res.status(400).json({ error: "Provide an email or school ID" });
  }
  const allowed = ["TEACHER", "EXAM_COORDINATOR"];
  if (role === "PRINCIPAL") {
    return res.status(403).json({ error: "Principal accounts cannot be requested via public signup" });
  }
  const chosenRole = allowed.includes(role) ? role : "TEACHER";

  if (email) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "Email already registered" });
  }
  if (schoolId) {
    const exists = await prisma.user.findUnique({ where: { schoolId } });
    if (exists) return res.status(409).json({ error: "School ID already registered" });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email: email || null,
      schoolId: schoolId || null,
      passwordHash: await bcrypt.hash(password, 10),
      role: chosenRole,
      status: "PENDING",
    },
  });

  return res.status(201).json({
    user: publicUser(user),
    token: null,
    message: "Account pending principal approval",
  });
});

authRouter.post("/login", async (req, res) => {
  const { email, schoolId, password } = req.body || {};
  if (!password || (!email && !schoolId)) {
    return res.status(400).json({ error: "Credentials are required" });
  }

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findUnique({ where: { schoolId } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.status === "PENDING") {
    return res.status(403).json({
      error: "Account pending principal approval",
      user: publicUser(user),
    });
  }
  if (user.status === "REJECTED") {
    return res.status(403).json({ error: "Account was rejected" });
  }

  return res.json({ user: publicUser(user), token: signToken(user) });
});

authRouter.get("/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: {
      assignments: { include: { classSection: true, subject: true } },
    },
  });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({
    user: publicUser(user),
    assignments: user.assignments,
  });
});

authRouter.post("/change-password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required" });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: "Not found" });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  res.json({ ok: true, message: "Password updated" });
});
