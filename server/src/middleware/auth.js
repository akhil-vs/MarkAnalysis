import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { ACCESS_COOKIE } from "../lib/authCookies.js";
import { ensurePendingSchema } from "../lib/ensureSchema.js";

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

/** Block API use until a required password change is completed. */
export async function rejectIfMustChangePassword(req, res, next) {
  if (!req.user?.userId || req.allowMustChangePassword) return next();
  try {
    await ensurePendingSchema();
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
    return next();
  } catch (err) {
    return next(err);
  }
}

export function auth(req, res, next) {
  const payload = verifyAccess(req, res);
  if (!payload) return;
  req.user = payload;
  return rejectIfMustChangePassword(req, res, next);
}

/** Authenticate, but allow callers who still need to change a temporary password. */
export function authAllowPasswordChange(req, res, next) {
  const payload = verifyAccess(req, res);
  if (!payload) return;
  req.user = payload;
  req.allowMustChangePassword = true;
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function signToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m" }
  );
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    schoolId: user.schoolId,
    role: user.role,
    status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
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
