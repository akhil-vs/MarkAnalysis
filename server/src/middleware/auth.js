import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { ACCESS_COOKIE } from "../lib/authCookies.js";
import { ensureAuthSchema } from "../lib/ensureSchema.js";
import { runWithoutTenant, runWithTenant } from "../lib/tenant.js";

function readAccessToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }
  return req.cookies?.[ACCESS_COOKIE] || null;
}

function verifyAccess(req, res) {
  const token = readAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
}

async function resolveTenantId(payload) {
  if (payload?.tenantId) return payload.tenantId;
  if (!payload?.userId) return null;
  const user = await runWithoutTenant(() =>
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    })
  );
  return user?.tenantId || null;
}

function continueWithTenant(req, res, next, cont) {
  if (req.user?.role === "PLATFORM_ADMIN") {
    return runWithoutTenant(() => cont());
  }
  return resolveTenantId(req.user)
    .then((tenantId) => {
      if (!tenantId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      req.user.tenantId = tenantId;
      return runWithTenant(tenantId, () => cont());
    })
    .catch((err) => next(err));
}

/** Block API use until a required password change is completed. */
export async function rejectIfMustChangePassword(req, res, next) {
  if (!req.user?.userId || req.allowMustChangePassword) return next();
  // Prefer the claim embedded at login/refresh to avoid a DB round-trip on every request.
  if (req.user.mustChangePassword === false) return next();
  if (req.user.mustChangePassword === true) {
    return res.status(403).json({
      error: "Password change required",
      code: "MUST_CHANGE_PASSWORD",
    });
  }
  try {
    await ensureAuthSchema();
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { mustChangePassword: true },
    });
    if (user?.mustChangePassword) {
      return res.status(403).json({
        error: "Password change required",
        code: "MUST_CHANGE_PASSWORD",
      });
    }
    req.user.mustChangePassword = false;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function auth(req, res, next) {
  const payload = verifyAccess(req, res);
  if (!payload) return;
  req.user = payload;
  return continueWithTenant(req, res, next, () => rejectIfMustChangePassword(req, res, next));
}

/** Authenticate, but allow callers who still need to change a temporary password. */
export function authAllowPasswordChange(req, res, next) {
  const payload = verifyAccess(req, res);
  if (!payload) return;
  req.user = payload;
  req.allowMustChangePassword = true;
  return continueWithTenant(req, res, next, () => next());
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

/**
 * Require the user to have at least one of the given feature ids.
 * PRINCIPAL / PLATFORM_ADMIN always pass. Uses req.featureAccess when present.
 */
export function requireFeature(...featureIds) {
  const needed = featureIds.filter(Boolean);
  return (req, res, next) => {
    if (!req.user) return res.status(403).json({ error: "Forbidden" });
    if (req.user.role === "PRINCIPAL" || req.user.role === "PLATFORM_ADMIN") {
      return next();
    }
    if (!needed.length) return next();
    const access = Array.isArray(req.featureAccess) ? req.featureAccess : null;
    if (access) {
      if (needed.some((id) => access.includes(id))) return next();
      return res.status(403).json({ error: "Forbidden" });
    }
    // Lazy resolve when session middleware did not attach features.
    return loadFeatureAccessForRequest(req)
      .then((list) => {
        req.featureAccess = list;
        if (needed.some((id) => list.includes(id))) return next();
        return res.status(403).json({ error: "Forbidden" });
      })
      .catch(() => res.status(403).json({ error: "Forbidden" }));
  };
}

async function loadFeatureAccessForRequest(req) {
  const { featuresForUser } = await import("../lib/roleFeatures.js");
  const { normalizeCustomStaffRoles } = await import("../lib/staffRoles.js");
  if (!req.user?.tenantId) {
    return featuresForUser({ role: req.user.role, roleTitle: req.user.roleTitle });
  }
  const school = await prisma.school.findUnique({
    where: { id: req.user.tenantId },
    select: { customStaffRoles: true, roleFeatureAccess: true },
  });
  return featuresForUser(
    { role: req.user.role, roleTitle: req.user.roleTitle },
    {
      customRoles: normalizeCustomStaffRoles(school?.customStaffRoles),
      roleFeatureAccess: school?.roleFeatureAccess,
    }
  );
}

export function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      name: user.name,
      tenantId: user.tenantId || null,
      mustChangePassword: Boolean(user.mustChangePassword),
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m" }
  );
}

export function publicUser(user, school) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    schoolId: user.schoolId,
    tenantId: user.tenantId || null,
    role: user.role,
    roleTitle: user.roleTitle || null,
    status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
    mfaEnabled: Boolean(user.mfaEnabled),
    school: school
      ? { id: school.id, name: school.name, slug: school.slug, status: school.status }
      : user.tenant
        ? { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug, status: user.tenant.status }
        : null,
  };
}

export async function getAssignments(userId) {
  return prisma.teacherAssignment.findMany({
    where: { userId },
    include: { classSection: true, subject: true },
  });
}

export async function getTeacherClassIds(userId) {
  const [assignments, taught] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: { userId },
      select: { classSectionId: true },
    }),
    prisma.classSection.findMany({
      where: { classTeacherId: userId },
      select: { id: true },
    }),
  ]);
  return [...new Set([...assignments.map((a) => a.classSectionId), ...taught.map((c) => c.id)])];
}

export async function teacherIsClassTeacher(userId, classSectionId) {
  if (!classSectionId) return false;
  const cls = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    select: { classTeacherId: true },
  });
  return cls?.classTeacherId === userId;
}

export function isLeadership(role) {
  return role === "PRINCIPAL" || role === "EXAM_COORDINATOR";
}

export function requireLeadership() {
  return requireRole("PRINCIPAL", "EXAM_COORDINATOR");
}

export async function teacherCanAccess(user, { classSectionId, subjectId, write = false } = {}) {
  if (isLeadership(user.role)) return true;
  if (write || subjectId) {
    const where = { userId: user.userId };
    if (classSectionId) where.classSectionId = classSectionId;
    if (subjectId) where.subjectId = subjectId;
    const match = await prisma.teacherAssignment.findFirst({ where });
    return Boolean(match);
  }
  if (classSectionId) {
    const assigned = await prisma.teacherAssignment.findFirst({
      where: { userId: user.userId, classSectionId },
    });
    if (assigned) return true;
    return teacherIsClassTeacher(user.userId, classSectionId);
  }
  return false;
}
