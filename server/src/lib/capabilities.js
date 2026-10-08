import { isLeadership } from "../middleware/auth.js";

function canEnterMarks(role) {
  return role === "TEACHER" || role === "EXAM_COORDINATOR";
}

/**
 * Coarse nav / UX capabilities derived from role + feature list.
 * FE should prefer this over re-implementing role matrices.
 */
export function capabilitiesForUser(user, features = []) {
  const role = user?.role;
  const featureSet = new Set(features || []);
  const leadership = isLeadership(role);
  const platform = role === "PLATFORM_ADMIN";

  let navProfile = "teacher";
  if (platform) navProfile = "platform";
  else if (role === "PRINCIPAL") navProfile = "principal";
  else if (role === "EXAM_COORDINATOR") navProfile = "coordinator";
  else if (role === "TEACHER") navProfile = "teacher";

  return {
    navProfile,
    canEnterMarks: canEnterMarks(role) && (featureSet.has("marks") || !features?.length),
    canApprove: leadership,
    canManageRecords: leadership && (featureSet.has("records") || !features?.length),
    canManageStaff: leadership && (featureSet.has("staff") || !features?.length),
    canViewApprovals: leadership,
    canViewInsights: featureSet.has("analysis") || featureSet.has("analysisClasses") || !features?.length,
    canViewDeepInsights: leadership && (featureSet.has("analysisDeep") || !features?.length),
    canNotifyTeachers: leadership,
    isClassTeacherCapable: role === "TEACHER",
  };
}
