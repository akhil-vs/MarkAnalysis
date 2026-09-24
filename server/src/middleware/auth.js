import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { ACCESS_COOKIE } from "../lib/authCookies.js";
import { runWithoutTenant, runWithTenant } from "../lib/tenant.js";

const STAFF_ROLES = new Set(["PLATFORM_ADMIN", "PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"]);

function readAccessToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const bearer = header.slice(7).trim();
    if (bearer) return bearer;
  }
  return req.cookies?.[ACCESS_COOKIE] || null;
}

/** Staff access JWTs only — reject MFA challenges, portal sessions, and other audiences. */
export function isStaffAccessPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.purpose || payload.kind) return false;
  if (!payload.userId || !payload.role) return false;
  return STAFF_ROLES.has(payload.role);
}

function verifyAccess(req, res) {
  const token = readAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!isStaffAccessPayload(payload)) {
      res.status(401).json({ error: "Invalid token" });
      return null;
    }
    return payload;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
}

const LIVE_STAFF_SELECT = {
  id: true,
  status: true,
  role: true,
  roleTitle: true,
  name: true,
  tenantId: true,
  mustChangePassword: true,
};

const LIVE_USER_TTL_MS = 10_000;
const liveUserCache = new Map();

function readLiveUserCache(userId) {
  const entry = liveUserCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() >= entry.expires) {
    liveUserCache.delete(userId);
    return undefined;
  }
  return entry.value;
}

/** Drop cached live staff identity (call after role/status/password mutations). */
export function invalidateLiveStaffUserCache(userId) {
  if (userId) liveUserCache.delete(String(userId));
  else liveUserCache.clear();
}

/** Overlay JWT identity with the live user row so demotions and resets apply immediately. */
export function applyLiveStaffUser(user) {
  if (!user) return { error: { status: 401, error: "Unauthorized" } };
  if (user.status === "PENDING" || user.status === "REJECTED") {
    return { error: { status: 401, error: "Unauthorized" } };
  }
  if (!STAFF_ROLES.has(user.role)) {
    return { error: { status: 401, error: "Invalid token" } };
  }
  return {
    user: {
      userId: user.id,
      role: user.role,
      roleTitle: user.roleTitle || null,
      name: user.name,
      tenantId: user.tenantId || null,
      mustChangePassword: Boolean(user.mustChangePassword),
    },
  };
}

async function loadLiveStaffUser(userId) {
  if (!userId) return { error: { status: 401, error: "Unauthorized" } };
  const cached = readLiveUserCache(userId);
  if (cached !== undefined) return cached;

  const user = await runWithoutTenant(() =>
    prisma.user.findUnique({
      where: { id: userId },
      select: LIVE_STAFF_SELECT,
    })
  );
  const result = applyLiveStaffUser(user);
  // Cache successes and auth failures briefly to cut repeat DB hits on bursty UIs.
  liveUserCache.set(userId, { value: result, expires: Date.now() + LIVE_USER_TTL_MS });
  return result;
}

function bindStaffRequest(req, res, next, live, cont) {
  req.user = live;
  if (req.user.role === "PLATFORM_ADMIN") {
    return runWithoutTenant(() => cont());
  }
  if (!req.user.tenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return runWithTenant(req.user.tenantId, () => cont());
}

/** Block API use until a required password change is completed. */
export function rejectIfMustChangePassword(req, res, next) {
  if (!req.user?.userId || req.allowMustChangePassword) return next();
  if (req.user.mustChangePassword) {
    return res.status(403).json({
      error: "Password change required",
      code: "MUST_CHANGE_PASSWORD",
    });
  }
  return next();
}

function withLiveStaff(req, res, next, cont) {
  const payload = verifyAccess(req, res);
  if (!payload) return;
  return loadLiveStaffUser(payload.userId)
    .then((result) => {
      if (result.error) {
        return res.status(result.error.status).json({ error: result.error.error });
      }
      return bindStaffRequest(req, res, next, result.user, cont);
    })
    .catch((err) => next(err));
}

export function auth(req, res, next) {
  return withLiveStaff(req, res, next, () => rejectIfMustChangePassword(req, res, next));
}

/** Authenticate, but allow callers who still need to change a temporary password. */
export function authAllowPasswordChange(req, res, next) {
  req.allowMustChangePassword = true;
  return withLiveStaff(req, res, next, () => next());
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
  // Reload roleTitle from DB so custom-role feature maps stay correct after title changes
  // and are not stuck on a stale JWT claim.
  let roleTitle = req.user?.roleTitle ?? null;
  if (req.user?.userId) {
    const fresh = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { roleTitle: true },
    });
    if (fresh) {
      roleTitle = fresh.roleTitle || null;
      req.user.roleTitle = roleTitle;
    }
  }
  if (!req.user?.tenantId) {
    return featuresForUser({ role: req.user.role, roleTitle });
  }
  const school = await prisma.school.findUnique({
    where: { id: req.user.tenantId },
    select: { customStaffRoles: true, roleFeatureAccess: true, optionalModules: true },
  });
  return featuresForUser(
    { role: req.user.role, roleTitle },
    {
      customRoles: normalizeCustomStaffRoles(school?.customStaffRoles),
      roleFeatureAccess: school?.roleFeatureAccess,
      optionalModules: school?.optionalModules,
    }
  );
}

export function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      roleTitle: user.roleTitle || null,
      name: user.name,
      tenantId: user.tenantId || null,
      mustChangePassword: Boolean(user.mustChangePassword),
    },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m" }
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
