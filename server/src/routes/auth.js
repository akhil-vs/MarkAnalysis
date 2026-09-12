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
import {
  clearAuthCookies,
  createRefreshSession,
  REFRESH_COOKIE,
  revokeRefreshSession,
  rotateRefreshSession,
  setAccessCookie,
  setRefreshCookie,
} from "../lib/authCookies.js";
import { findSchoolByJoinCode } from "../lib/school.js";
import { normalizeJoinCode } from "../lib/schoolIdentity.js";
import { runWithoutTenant, runWithTenant } from "../lib/tenant.js";

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
  const school =
    user.tenant ||
    (user.tenantId
      ? await runWithoutTenant(() =>
          prisma.school.findUnique({
            where: { id: user.tenantId },
            select: { id: true, name: true, slug: true, status: true },
          })
        )
      : null);
  return { user: publicUser(user, school) };
}

async function assertSchoolActive(school) {
  if (!school) {
    const err = new Error("School not found");
    err.status = 404;
    throw err;
  }
  if (school.status === "SUSPENDED") {
    const err = new Error("This school is suspended");
    err.status = 403;
    throw err;
  }
  return school;
}

authRouter.post("/signup", authWriteLimit, async (req, res) => {
  const { name, email, schoolId, password, role, joinCode } = req.body || {};
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

  const code = normalizeJoinCode(joinCode);
  if (!code) {
    return res.status(400).json({ error: "Enter your school’s join code" });
  }
  const school = await findSchoolByJoinCode(code);
  if (!school) return res.status(404).json({ error: "Unknown school join code" });
  try {
    await assertSchoolActive(school);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  if (email) {
    const exists = await runWithoutTenant(() => prisma.user.findUnique({ where: { email } }));
    if (exists) return res.status(409).json({ error: "Email already registered" });
  }
  if (schoolId) {
    const exists = await runWithTenant(school.id, () =>
      prisma.user.findFirst({ where: { schoolId } })
    );
    if (exists) return res.status(409).json({ error: "School ID already registered at this school" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await runWithTenant(school.id, () =>
    prisma.user.create({
      data: {
        name,
        email: email || null,
        schoolId: schoolId || null,
        passwordHash,
        role: chosenRole,
        status: "PENDING",
        mustChangePassword: false,
      },
    })
  );

  return res.status(201).json({
    user: publicUser(user, school),
    message: "Account pending principal approval",
  });
});

authRouter.post("/login", authWriteLimit, async (req, res) => {
  const { email, schoolId, password, joinCode } = req.body || {};
  if (!password || (!email && !schoolId)) {
    return res.status(400).json({ error: "Credentials are required" });
  }

  let user;
  try {
    user = await runWithoutTenant(async () => {
      if (email) return prisma.user.findUnique({ where: { email } });
      const matches = await prisma.user.findMany({ where: { schoolId } });
      if (!matches.length) return null;
      if (matches.length === 1) return matches[0];
      const code = normalizeJoinCode(joinCode);
      if (!code) {
        const err = new Error("Enter your school join code to sign in with this staff ID");
        err.status = 400;
        err.code = "JOIN_CODE_REQUIRED";
        throw err;
      }
      const school = await prisma.school.findUnique({ where: { joinCode: code } });
      if (!school) return null;
      return matches.find((row) => row.tenantId === school.id) || null;
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
    throw err;
  }

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.role === "PLATFORM_ADMIN") {
    if (user.status !== "ACTIVE") {
      return res.status(403).json({ error: "Account was rejected" });
    }
    return res.json(await runWithoutTenant(() => establishSession(req, res, user)));
  }

  const school = await runWithoutTenant(() =>
    prisma.school.findUnique({ where: { id: user.tenantId } })
  );
  try {
    await assertSchoolActive(school);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  if (user.status === "PENDING") {
    return res.status(403).json({
      error: "Account pending principal approval",
      user: publicUser(user, school),
    });
  }
  if (user.status === "REJECTED") {
    return res.status(403).json({ error: "Account was rejected" });
  }

  return res.json(await runWithTenant(user.tenantId, () => establishSession(req, res, user)));
});

authRouter.post("/refresh", authWriteLimit, async (req, res) => {
  const rotated = await runWithoutTenant(() =>
    rotateRefreshSession(req.cookies?.[REFRESH_COOKIE], {
      userAgent: req.get("user-agent"),
    })
  );
  if (!rotated) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Session expired" });
  }
  const user = await runWithoutTenant(() => prisma.user.findUnique({ where: { id: rotated.userId } }));
  if (!user || user.status === "PENDING" || user.status === "REJECTED") {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Session expired" });
  }
  if (user.role === "PLATFORM_ADMIN") {
    setAccessCookie(res, signToken(user));
    setRefreshCookie(res, rotated.raw);
    return res.json({ user: publicUser(user, null) });
  }
  const school = await runWithoutTenant(() => prisma.school.findUnique({ where: { id: user.tenantId } }));
  if (!school || school.status === "SUSPENDED") {
    clearAuthCookies(res);
    return res.status(403).json({ error: "This school is suspended" });
  }
  setAccessCookie(res, signToken(user));
  setRefreshCookie(res, rotated.raw);
  return res.json({ user: publicUser(user, school) });
});

authRouter.post("/logout", async (req, res) => {
  await runWithoutTenant(() => revokeRefreshSession(req.cookies?.[REFRESH_COOKIE]));
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
