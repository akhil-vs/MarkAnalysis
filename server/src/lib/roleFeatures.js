/**
 * Principal-managed feature access for staff roles.
 * PRINCIPAL and PLATFORM_ADMIN always have every feature.
 */

export const FEATURE_CATALOG = [
  { id: "marks", label: "Mark register", group: "Marks", description: "Enter and review marks for assigned papers." },
  { id: "upload", label: "Bulk upload", group: "Marks", description: "Upload marks from a spreadsheet." },
  { id: "pendingUploads", label: "Pending uploads", group: "Marks", description: "Review and approve submitted mark registers." },
  { id: "accessRequests", label: "Access requests", group: "Marks", description: "Approve late-entry and edit requests." },
  { id: "consolidated", label: "Consolidated lists", group: "Marks", description: "Open and download consolidated mark lists." },
  { id: "audit", label: "Audit log", group: "Marks", description: "View school activity and mark change history." },
  { id: "analysis", label: "Marks analysis", group: "Insights", description: "Open the analysis hub and nested reports." },
  { id: "analysisSchool", label: "School overview", group: "Insights", description: "School-wide KPIs and grade mix." },
  { id: "analysisClasses", label: "Class analysis", group: "Insights", description: "Class and section result reports." },
  { id: "analysisSubjects", label: "Subject analysis", group: "Insights", description: "Subject and paper comparisons." },
  { id: "analysisTeachers", label: "Teacher analysis", group: "Insights", description: "Teacher averages and comparisons." },
  { id: "analysisStudents", label: "Student analysis", group: "Insights", description: "Student trends and report cards." },
  { id: "analysisCompare", label: "Compare", group: "Insights", description: "Year-on-year and teacher comparisons." },
  { id: "analysisDeep", label: "Deep insights", group: "Insights", description: "Cohorts, readiness, and weighted annuals." },
  { id: "staff", label: "Staff", group: "School setup", description: "Manage staff accounts and assignments." },
  { id: "records", label: "School records", group: "School setup", description: "Classes, subjects, students, and exams." },
  { id: "timetables", label: "Timetables", group: "School setup", description: "View and manage teacher timetables." },
  { id: "schoolProfile", label: "School profile", group: "School setup", description: "Edit school identity, grading, and schedule." },
  { id: "boardOps", label: "Board ops", group: "School setup", description: "Board calendar, report cards, and packs." },
  { id: "cpd", label: "CPD", group: "School setup", description: "Training plans, observations, and certificates." },
];

export const FEATURE_IDS = FEATURE_CATALOG.map((f) => f.id);

const FEATURE_ID_SET = new Set(FEATURE_IDS);

/** Always available; not principal-toggleable. */
export const ALWAYS_ON_FEATURES = ["dashboard", "profile"];

/** Defaults matching historical RBAC (nav + route guards). */
export const DEFAULT_FEATURES_BY_BASE_ROLE = {
  TEACHER: {
    marks: true,
    upload: true,
    pendingUploads: false,
    accessRequests: false,
    consolidated: true, // still gated by class-teacher status in nav/API
    audit: false,
    analysis: true,
    analysisSchool: false,
    analysisClasses: true,
    analysisSubjects: false,
    analysisTeachers: false,
    analysisStudents: true,
    analysisCompare: false,
    analysisDeep: false,
    staff: false,
    records: false,
    timetables: false,
    schoolProfile: false,
    boardOps: false,
    cpd: true,
  },
  EXAM_COORDINATOR: {
    marks: true,
    upload: true,
    pendingUploads: true,
    accessRequests: true,
    consolidated: true,
    audit: true,
    analysis: true,
    analysisSchool: true,
    analysisClasses: true,
    analysisSubjects: true,
    analysisTeachers: true,
    analysisStudents: true,
    analysisCompare: true,
    analysisDeep: true,
    staff: true,
    records: true,
    timetables: true,
    schoolProfile: true,
    boardOps: true,
    cpd: true,
  },
};

const SYSTEM_ACCESS_KEYS = new Set(["TEACHER", "EXAM_COORDINATOR"]);

export function isFeatureId(id) {
  return FEATURE_ID_SET.has(id);
}

export function defaultFeaturesForBaseRole(baseRole) {
  const base = baseRole === "EXAM_COORDINATOR" ? "EXAM_COORDINATOR" : "TEACHER";
  return { ...DEFAULT_FEATURES_BY_BASE_ROLE[base] };
}

/** Normalize a features map; unknown keys dropped; missing keys filled from defaults. */
export function normalizeFeatureMap(raw, baseRole = "TEACHER") {
  const defaults = defaultFeaturesForBaseRole(baseRole);
  const out = { ...defaults };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const id of FEATURE_IDS) {
    if (Object.prototype.hasOwnProperty.call(raw, id)) {
      out[id] = Boolean(raw[id]);
    }
  }
  // Parent analysis off ⇒ nested insights off for effective access resolution,
  // but we still persist nested values as stored.
  return out;
}

export function normalizeRoleFeatureAccess(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = String(key || "").trim();
    if (!id) continue;
    const baseRole = id === "EXAM_COORDINATOR" ? "EXAM_COORDINATOR" : "TEACHER";
    out[id] = normalizeFeatureMap(value, SYSTEM_ACCESS_KEYS.has(id) ? id : baseRole);
  }
  return out;
}

/**
 * Resolve which access-key to use for a user (system role or custom role id).
 * Custom roles are matched by roleTitle + baseRole when customRoleId is absent.
 */
export function resolveAccessRoleKey(user, customRoles = []) {
  if (!user) return null;
  if (user.role === "PRINCIPAL" || user.role === "PLATFORM_ADMIN") return user.role;
  if (user.customRoleId) {
    const byId = customRoles.find((r) => r.id === user.customRoleId);
    if (byId) return byId.id;
  }
  if (user.roleTitle) {
    const match = customRoles.find(
      (r) => r.name === user.roleTitle && (!r.baseRole || r.baseRole === user.role)
    );
    if (match) return match.id;
  }
  if (user.role === "TEACHER" || user.role === "EXAM_COORDINATOR") return user.role;
  return null;
}

export function effectiveFeatureMap(accessKey, roleFeatureAccess, { baseRole = "TEACHER" } = {}) {
  if (accessKey === "PRINCIPAL" || accessKey === "PLATFORM_ADMIN") {
    const all = {};
    for (const id of FEATURE_IDS) all[id] = true;
    return all;
  }
  const stored = normalizeRoleFeatureAccess(roleFeatureAccess);
  const defaults = defaultFeaturesForBaseRole(
    accessKey === "EXAM_COORDINATOR" || baseRole === "EXAM_COORDINATOR"
      ? "EXAM_COORDINATOR"
      : "TEACHER"
  );
  if (stored[accessKey]) {
    return { ...defaults, ...stored[accessKey] };
  }
  // Custom role with no override: inherit system base role defaults (or stored system override).
  if (!SYSTEM_ACCESS_KEYS.has(accessKey)) {
    const systemKey = baseRole === "EXAM_COORDINATOR" ? "EXAM_COORDINATOR" : "TEACHER";
    if (stored[systemKey]) return { ...defaults, ...stored[systemKey] };
  }
  return defaults;
}

/** Enabled feature id list for session / nav (includes always-on). */
export function enabledFeatureList(featureMap) {
  const enabled = new Set(ALWAYS_ON_FEATURES);
  for (const id of FEATURE_IDS) {
    if (featureMap?.[id]) enabled.add(id);
  }
  // Nested analysis requires parent analysis.
  if (!enabled.has("analysis")) {
    for (const id of FEATURE_IDS) {
      if (id.startsWith("analysis") && id !== "analysis") enabled.delete(id);
    }
  }
  return [...enabled];
}

export function featuresForUser(user, { customRoles = [], roleFeatureAccess = null } = {}) {
  if (!user) return [...ALWAYS_ON_FEATURES];
  if (user.role === "PRINCIPAL" || user.role === "PLATFORM_ADMIN") {
    return enabledFeatureList(
      Object.fromEntries(FEATURE_IDS.map((id) => [id, true]))
    );
  }
  const accessKey = resolveAccessRoleKey(user, customRoles);
  const custom = customRoles.find((r) => r.id === accessKey);
  const baseRole = custom?.baseRole || user.role || "TEACHER";
  const map = effectiveFeatureMap(accessKey || user.role, roleFeatureAccess, { baseRole });
  return enabledFeatureList(map);
}

export function userHasFeature(user, featureId, opts = {}) {
  if (!featureId || ALWAYS_ON_FEATURES.includes(featureId)) return true;
  if (!isFeatureId(featureId)) return true;
  return featuresForUser(user, opts).includes(featureId);
}

/**
 * Merge a partial features patch into the school roleFeatureAccess map.
 * Returns { access } or { error }.
 */
export function patchRoleFeatures(existingRaw, roleId, featuresPatch, { baseRole = "TEACHER" } = {}) {
  const roleKey = String(roleId || "").trim();
  if (!roleKey) return { error: "Role is required" };
  if (roleKey === "PRINCIPAL" || roleKey === "PLATFORM_ADMIN") {
    return { error: "Principal and platform admin access cannot be changed" };
  }
  if (!featuresPatch || typeof featuresPatch !== "object" || Array.isArray(featuresPatch)) {
    return { error: "Features map is required" };
  }
  const current = normalizeRoleFeatureAccess(existingRaw);
  const base =
    roleKey === "EXAM_COORDINATOR" || baseRole === "EXAM_COORDINATOR"
      ? "EXAM_COORDINATOR"
      : "TEACHER";
  const nextForRole = normalizeFeatureMap(
    { ...(current[roleKey] || defaultFeaturesForBaseRole(base)), ...featuresPatch },
    base
  );
  return {
    access: {
      ...current,
      [roleKey]: nextForRole,
    },
    features: nextForRole,
  };
}

/** Map nav / route feature ids used by the SPA. */
export function featureIdForNavItem(navItemId) {
  if (!navItemId) return null;
  if (ALWAYS_ON_FEATURES.includes(navItemId)) return navItemId;
  if (FEATURE_ID_SET.has(navItemId)) return navItemId;
  return null;
}
