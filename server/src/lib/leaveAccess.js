import { prisma } from "./prisma.js";
import { notifyUsers } from "./notifications.js";
import { featuresForUser } from "./roleFeatures.js";
import { normalizeCustomStaffRoles } from "./staffRoles.js";

/** Titles that should always hear about teacher leave (besides Principal / Exam Coordinator). */
const LEAVE_STAKEHOLDER_TITLE_RE =
  /\b(vice[\s-]?principal|v\.?\s*p\.?|supervisor|co-?ordinator|coordinator|principal)\b/i;

export function timetableLink(dateYmd, mode = "leave") {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (dateYmd) params.set("date", dateYmd);
  return `/timetables?${params.toString()}`;
}

/**
 * Resolve feature list for the request user (uses req.featureAccess when present).
 */
export async function resolveRequestFeatures(req) {
  if (Array.isArray(req.featureAccess)) return req.featureAccess;
  if (!req.user) return [];
  if (req.user.role === "PRINCIPAL" || req.user.role === "PLATFORM_ADMIN") {
    const { FEATURE_IDS, ALWAYS_ON_FEATURES, PRINCIPAL_EXCLUDED_FEATURES } = await import("./roleFeatures.js");
    let list = [...ALWAYS_ON_FEATURES, ...FEATURE_IDS];
    if (req.user.role === "PRINCIPAL") {
      list = list.filter((id) => !PRINCIPAL_EXCLUDED_FEATURES.includes(id));
    }
    req.featureAccess = list;
    return list;
  }
  if (!req.user.tenantId) {
    const list = featuresForUser({ role: req.user.role, roleTitle: req.user.roleTitle });
    req.featureAccess = list;
    return list;
  }
  const school = await prisma.school.findUnique({
    where: { id: req.user.tenantId },
    select: { customStaffRoles: true, roleFeatureAccess: true, optionalModules: true },
  });
  const list = featuresForUser(
    { role: req.user.role, roleTitle: req.user.roleTitle },
    {
      customRoles: normalizeCustomStaffRoles(school?.customStaffRoles),
      roleFeatureAccess: school?.roleFeatureAccess,
      optionalModules: school?.optionalModules,
    }
  );
  req.featureAccess = list;
  return list;
}

export async function userHasLeaveFeature(req, featureId) {
  if (!req.user) return false;
  if (req.user.role === "PRINCIPAL" || req.user.role === "PLATFORM_ADMIN") return true;
  const features = await resolveRequestFeatures(req);
  return features.includes(featureId);
}

export async function canApproveLeave(req) {
  return userHasLeaveFeature(req, "leaveApproval");
}

export async function canAssignSubstitutes(req) {
  return userHasLeaveFeature(req, "assignSubstitutes");
}

/** Daily board / teacher list / free finder for leave and cover ops. */
export async function canManageTimetableOps(req) {
  if (!req.user) return false;
  if (req.user.role === "PRINCIPAL" || req.user.role === "PLATFORM_ADMIN") return true;
  if (req.user.role === "EXAM_COORDINATOR") {
    const features = await resolveRequestFeatures(req);
    return (
      features.includes("timetables") ||
      features.includes("leaveApproval") ||
      features.includes("assignSubstitutes")
    );
  }
  const features = await resolveRequestFeatures(req);
  return (
    features.includes("timetables") ||
    features.includes("leaveApproval") ||
    features.includes("assignSubstitutes")
  );
}

/** Access to timetable leave APIs: approval, substitutes, full timetables, or own leave. */
export async function canAccessLeaveApis(req) {
  if (!req.user) return false;
  if (req.user.role === "PRINCIPAL" || req.user.role === "PLATFORM_ADMIN") return true;
  const features = await resolveRequestFeatures(req);
  if (
    features.includes("leaveApproval") ||
    features.includes("assignSubstitutes") ||
    features.includes("timetables")
  ) {
    return true;
  }
  // Teachers may request / view their own leave without those features.
  return req.user.role === "TEACHER";
}

/**
 * Staff who should be notified about leave requests and approvals:
 * Principal, Exam Coordinator, and anyone whose title matches VP / supervisor / coordinator,
 * plus anyone granted leaveApproval via role access.
 */
export async function listLeaveStakeholderUserIds({ excludeUserId } = {}) {
  const school = await prisma.school.findFirst({
    select: { customStaffRoles: true, roleFeatureAccess: true, optionalModules: true },
  });
  const customRoles = normalizeCustomStaffRoles(school?.customStaffRoles);
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["PRINCIPAL", "EXAM_COORDINATOR", "TEACHER"] },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: {
      id: true,
      role: true,
      roleTitle: true,
    },
  });

  const ids = [];
  for (const user of users) {
    if (user.role === "PRINCIPAL" || user.role === "EXAM_COORDINATOR") {
      ids.push(user.id);
      continue;
    }
    const title = String(user.roleTitle || "").trim();
    if (title && LEAVE_STAKEHOLDER_TITLE_RE.test(title)) {
      ids.push(user.id);
      continue;
    }
    const features = featuresForUser(
      { role: user.role, roleTitle: user.roleTitle },
      {
        customRoles,
        roleFeatureAccess: school?.roleFeatureAccess,
        optionalModules: school?.optionalModules,
      }
    );
    if (features.includes("leaveApproval")) ids.push(user.id);
  }
  return [...new Set(ids)];
}

export async function notifyLeaveStakeholders(payload, { excludeUserId } = {}) {
  const ids = await listLeaveStakeholderUserIds({ excludeUserId });
  return notifyUsers(ids, payload);
}
