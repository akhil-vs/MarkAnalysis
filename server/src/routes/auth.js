import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { parseEmail } from "../lib/numbers.js";
import {
  authAllowPasswordChange,
  publicUser,
  signToken,
} from "../middleware/auth.js";
import { authAttemptKey, rateLimit } from "../lib/rateLimit.js";

export const authRouter = Router();

const authWriteLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: authAttemptKey,
  message: "Too many sign-in attempts. Try again in a few minutes.",
});

authRouter.post("/signup", authWriteLimit, async (req, res) => {
  const { name, email, schoolId, password, role } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!email && !schoolId) {
    return res.status(400).json({ error: "Provide an email or school ID" });
  }
  if (email) {
    const parsedEmail = parseEmail(email, { required: true });
    if (parsedEmail.error) return res.status(400).json({ error: parsedEmail.error });
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
      mustChangePassword: false,
    },
  });

  return res.status(201).json({
    user: publicUser(user),
    token: null,
    message: "Account pending principal approval",
  });
});

authRouter.post("/login", authWriteLimit, async (req, res) => {
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

authRouter.get("/me", authAllowPasswordChange, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: {
      assignments: { include: { classSection: true, subject: true } },
      classTeacherOf: {
        select: { id: true, className: true, section: true },
        orderBy: [{ className: "asc" }, { section: "asc" }],
      },
    },
  });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({
    user: publicUser(user),
    assignments: user.assignments,
    classTeacherOf: user.classTeacherOf.map((c) => ({
      id: c.id,
      className: c.className,
      section: c.section,
      label: `${c.className}-${c.section}`,
    })),
  });
});

authRouter.post("/change-password", authAllowPasswordChange, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required" });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  if (String(newPassword) === String(currentPassword)) {
    return res.status(400).json({ error: "New password must be different from the current password" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: "Not found" });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 10),
      mustChangePassword: false,
    },
  });
  res.json({
    ok: true,
    message: "Password updated",
    user: publicUser(updated),
    token: signToken(updated),
  });
});
