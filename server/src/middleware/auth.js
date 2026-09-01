import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
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
    { expiresIn: "7d" }
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
  };
}

export async function getAssignments(userId) {
  return prisma.teacherAssignment.findMany({
    where: { userId },
    include: { classSection: true, subject: true },
  });
}

export async function teacherCanAccess(user, { classSectionId, subjectId }) {
  if (user.role === "PRINCIPAL" || user.role === "EXAM_COORDINATOR") return true;
  const where = { userId: user.userId };
  if (classSectionId) where.classSectionId = classSectionId;
  if (subjectId) where.subjectId = subjectId;
  const match = await prisma.teacherAssignment.findFirst({ where });
  return Boolean(match);
}
