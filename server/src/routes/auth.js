import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { parseEmail } from "../lib/numbers.js";
import {
  auth,
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
import { logActivity } from "../lib/activityAudit.js";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpAuthUrl,
  verifyTotp,
} from "../lib/totp.js";

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
  let normalizedEmail = null;
  if (email) {
    const parsedEmail = parseEmail(email, { required: true });
    if (parsedEmail.error) return res.status(400).json({ error: parsedEmail.error });
    normalizedEmail = parsedEmail.value;
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

  if (normalizedEmail) {
    const exists = await runWithoutTenant(() => prisma.user.findUnique({ where: { email: normalizedEmail } }));
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
        email: normalizedEmail || null,
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

  let normalizedEmail = null;
  if (email) {
    const parsedEmail = parseEmail(email, { required: true });
    if (parsedEmail.error) return res.status(400).json({ error: parsedEmail.error });
    normalizedEmail = parsedEmail.value;
  }

  let user;
  try {
    user = await runWithoutTenant(async () => {
      if (normalizedEmail) return prisma.user.findUnique({ where: { email: normalizedEmail } });
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
    if (user.mfaEnabled && user.mfaSecret) {
      return res.json(issueMfaChallenge(user));
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

  if (user.mfaEnabled && user.mfaSecret) {
    return res.json(issueMfaChallenge(user));
  }

  return res.json(await runWithTenant(user.tenantId, () => establishSession(req, res, user)));
});

function issueMfaChallenge(user) {
  const mfaToken = jwt.sign(
    { purpose: "mfa", userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
  );
  return {
    mfaRequired: true,
    mfaToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

async function completeLoginAfterMfa(req, res, user) {
  if (user.role === "PLATFORM_ADMIN") {
    return res.json(await runWithoutTenant(() => establishSession(req, res, user)));
  }
  return res.json(await runWithTenant(user.tenantId, () => establishSession(req, res, user)));
}

authRouter.post("/mfa/verify", authWriteLimit, async (req, res) => {
  const { mfaToken, code, recoveryCode } = req.body || {};
  if (!mfaToken) return res.status(400).json({ error: "mfaToken is required" });
  let payload;
  try {
    payload = jwt.verify(mfaToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "MFA challenge expired" });
  }
  if (payload?.purpose !== "mfa" || !payload.userId) {
    return res.status(401).json({ error: "Invalid MFA challenge" });
  }

  const user = await runWithoutTenant(() => prisma.user.findUnique({ where: { id: payload.userId } }));
  if (!user?.mfaEnabled || !user.mfaSecret) {
    return res.status(400).json({ error: "MFA is not enabled for this account" });
  }

  let ok = false;
  if (code && verifyTotp(user.mfaSecret, code)) {
    ok = true;
  } else if (recoveryCode) {
    const next = consumeRecoveryCode(user.mfaRecoveryHashes, recoveryCode);
    if (next) {
      await runWithoutTenant(() =>
        prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryHashes: next } })
      );
      ok = true;
    }
  }
  if (!ok) return res.status(401).json({ error: "Invalid authentication code" });

  return completeLoginAfterMfa(req, res, user);
});

authRouter.post("/mfa/setup", auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: "Not found" });
  if (user.mfaEnabled) {
    return res.status(400).json({ error: "MFA is already enabled" });
  }
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: secret, mfaEnabled: false },
  });
  const accountName = user.email || user.schoolId || user.name;
  res.json({
    secret,
    otpauthUrl: totpAuthUrl({ secret, accountName }),
  });
});

authRouter.post("/mfa/enable", auth, async (req, res) => {
  const { code } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user?.mfaSecret) {
    return res.status(400).json({ error: "Call MFA setup first" });
  }
  if (!verifyTotp(user.mfaSecret, code)) {
    return res.status(400).json({ error: "Invalid authentication code" });
  }
  const recoveryCodes = generateRecoveryCodes();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: true,
      mfaRecoveryHashes: recoveryCodes.map(hashRecoveryCode),
    },
  });
  try {
    await logActivity({
      actorId: user.id,
      action: "MFA_ENABLED",
      summary: `${user.name} enabled MFA`,
      tenantId: user.tenantId || undefined,
    });
  } catch {
    // platform admin may lack tenant
  }
  res.json({
    ok: true,
    user: publicUser(updated),
    recoveryCodes,
  });
});

authRouter.post("/mfa/disable", auth, async (req, res) => {
  const { password, code } = req.body || {};
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: "Not found" });
  if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Password is incorrect" });
  }
  if (user.mfaEnabled && user.mfaSecret && !verifyTotp(user.mfaSecret, code)) {
    return res.status(401).json({ error: "Invalid authentication code" });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryHashes: null },
  });
  try {
    await logActivity({
      actorId: user.id,
      action: "MFA_DISABLED",
      summary: `${user.name} disabled MFA`,
      tenantId: user.tenantId || undefined,
    });
  } catch {
    // ignore
  }
  res.json({ ok: true, user: publicUser(updated) });
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
