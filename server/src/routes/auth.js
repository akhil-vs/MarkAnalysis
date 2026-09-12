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
import { assertSchoolActive, findActiveSchoolBySlug, parseSlug } from "../lib/tenant.js";
import {
  clearAuthCookies,
  createRefreshSession,
  REFRESH_COOKIE,
  revokeRefreshSession,
  rotateRefreshSession,
  setAccessCookie,
  setRefreshCookie,
} from "../lib/authCookies.js";

export const authRouter = Router();

const authWriteLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: authAttemptKey,
  message: "Too many sign-in attempts. Try again in a few minutes.",
});

async function establishSession(req, res, user) {
  const access = signToken(user);
  const refresh = await createRefreshSession(user.id, { userAgent: req.get("user-agent") });
  setAccessCookie(res, access);
  setRefreshCookie(res, refresh.raw);
  const withTenant =
    user.tenant || user.role === "PLATFORM_ADMIN"
      ? user
      : await prisma.user.findUnique({
          where: { id: user.id },
          include: { tenant: { select: { id: true, name: true, slug: true, status: true } } },
        });
  return { user: publicUser(withTenant || user) };
}

authRouter.get("/school-lookup", async (req, res) => {
  const parsed = parseSlug(req.query.slug);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const found = await findActiveSchoolBySlug(parsed.value);
  if (found.error) return res.status(404).json({ error: "School not found" });
  res.json({ name: found.school.name, slug: found.school.slug, board: found.school.board });
});

authRouter.post("/signup", authWriteLimit, async (req, res) => {
  const { name, email, schoolId, password, role, schoolSlug } = req.body || {};
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

  const found = await findActiveSchoolBySlug(schoolSlug);
  if (found.error) return res.status(400).json({ error: found.error });

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
      tenantId: found.school.id,
    },
  });

  return res.status(201).json({
    user: publicUser(user),
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
  if (user.role !== "PLATFORM_ADMIN") {
    const active = await assertSchoolActive(user.tenantId);
    if (active.error) return res.status(403).json({ error: active.error });
  }

  return res.json(await establishSession(req, res, user));
});

authRouter.post("/refresh", authWriteLimit, async (req, res) => {
  const rotated = await rotateRefreshSession(req.cookies?.[REFRESH_COOKIE], {
    userAgent: req.get("user-agent"),
  });
  if (!rotated) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Session expired" });
  }
  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user || user.status === "PENDING" || user.status === "REJECTED") {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Session expired" });
  }
  if (user.role !== "PLATFORM_ADMIN") {
    const active = await assertSchoolActive(user.tenantId);
    if (active.error) {
      clearAuthCookies(res);
      return res.status(403).json({ error: active.error });
    }
  }
  setAccessCookie(res, signToken(user));
  setRefreshCookie(res, rotated.raw);
  return res.json({ user: publicUser(user) });
});

authRouter.post("/logout", async (req, res) => {
  await revokeRefreshSession(req.cookies?.[REFRESH_COOKIE]);
  clearAuthCookies(res);
  return res.json({ ok: true });
});

authRouter.get("/me", authAllowPasswordChange, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: {
      tenant: { select: { id: true, name: true, slug: true, status: true } },
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
    ...(await establishSession(req, res, updated)),
  });
});
