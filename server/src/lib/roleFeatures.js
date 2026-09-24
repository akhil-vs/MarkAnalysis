/**
 * Principal-managed feature access for staff roles.
 * PRINCIPAL and PLATFORM_ADMIN always have every catalog feature,
 * except school-level optional modules that stay off until enabled,
 * and mark entry / bulk upload which principals do not use.
 */

export const FEATURE_CATALOG = [
  { id: "marks", label: "Mark register", group: "Exam office", description: "Enter and review marks for assigned papers." },
  { id: "upload", label: "Bulk upload", group: "Exam office", description: "Upload marks from a spreadsheet." },
  { id: "pendingUploads", label: "Pending uploads", group: "Exam office", description: "Review and approve submitted mark registers." },
  { id: "accessRequests", label: "Access requests", group: "Exam office", description: "Approve late-entry and edit requests." },
  { id: "consolidated", label: "Consolidated lists", group: "Exam office", description: "Open and download consolidated mark lists." },
  { id: "hallTickets", label: "Hall tickets", group: "Exam office", description: "Create and print class hall tickets for an exam." },
  {
    id: "studentPhotos",
    label: "Student photos",
    group: "Exam office",
    description: "Upload and clear student photos for hall tickets and school records.",
  },
  { id: "audit", label: "Audit log", group: "Exam office", description: "View school activity and mark change history." },
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
  {
    id: "leaveApproval",
    label: "Leave approval",
    group: "School setup",
    description: "Approve or reject teacher leave requests and put staff on leave.",
  },
  {
    id: "assignSubstitutes",
    label: "Assign substitutes",
    group: "School setup",
    description: "Assign and remove substitute teachers for leave cover on the timetable.",
  },
  { id: "schoolProfile", label: "School profile", group: "School setup", description: "Edit school identity, grading, and schedule." },
  { id: "boardOps", label: "Board console", group: "School setup", description: "CBSE board-facing calendar, report-card release, revaluation, and upload packs — separate from day-to-day Exam office work." },
  { id: "cpd", label: "CPD", group: "School setup", description: "Training plans, observations, and certificates." },
];

export const FEATURE_IDS = FEATURE_CATALOG.map((f) => f.id);

const FEATURE_ID_SET = new Set(FEATURE_IDS);

/** Always available; not principal-toggleable. */
export const ALWAYS_ON_FEATURES = ["dashboard", "profile", "help"];

/**
 * Features principals do not use. Mark register stays reachable via deep links
 * from Pending uploads for review/approve; bulk upload is fully withheld.
 */
export const PRINCIPAL_EXCLUDED_FEATURES = ["upload"];

/**
 * Features hidden school-wide until principal enables them under School profile.
 * Role access still applies after a module is turned on.
 */
export const OPTIONAL_MODULE_IDS = ["boardOps", "cpd"];

/** Optional modules that stay in the schema/API but are not offered in the product UI. */
export const HIDDEN_OPTIONAL_MODULE_IDS = ["boardOps"];

export const DEFAULT_OPTIONAL_MODULES = Object.fromEntries(
  OPTIONAL_MODULE_IDS.map((id) => [id, false])
);

/** Defaults matching historical RBAC (nav + route guards), with optional modules off. */
export const DEFAULT_FEATURES_BY_BASE_ROLE = {
  TEACHER: {
    marks: true,
    upload: true,
    pendingUploads: false,
    accessRequests: false,
    consolidated: true, // still gated by class-teacher status in nav/API
    hallTickets: true,
    studentPhotos: true,
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
    leaveApproval: false,
    assignSubstitutes: false,
    schoolProfile: false,
    boardOps: false,
    cpd: false,
  },
  EXAM_COORDINATOR: {
    marks: true,
    upload: true,
    pendingUploads: true,
    accessRequests: true,
    consolidated: true,
    hallTickets: true,
    studentPhotos: true,
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
    leaveApproval: true,
    assignSubstitutes: true,
    schoolProfile: true,
    boardOps: false,
    cpd: false,
  },
};

const SYSTEM_ACCESS_KEYS = new Set(["TEACHER", "EXAM_COORDINATOR"]);
const OPTIONAL_MODULE_ID_SET = new Set(OPTIONAL_MODULE_IDS);

export function isFeatureId(id) {
  return FEATURE_ID_SET.has(id);
}

export function isOptionalModuleId(id) {
  return OPTIONAL_MODULE_ID_SET.has(id);
}

/** Normalize school optionalModules; missing keys default to hidden (false). */
export function normalizeOptionalModules(raw) {
  const out = { ...DEFAULT_OPTIONAL_MODULES };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    for (const id of HIDDEN_OPTIONAL_MODULE_IDS) out[id] = false;
    return out;
  }
  for (const id of OPTIONAL_MODULE_IDS) {
    if (Object.prototype.hasOwnProperty.call(raw, id)) {
      out[id] = Boolean(raw[id]);
    }
  }
  // Board console is intentionally not product-facing for now.
  for (const id of HIDDEN_OPTIONAL_MODULE_IDS) out[id] = false;
  return out;
}

/**
 * Merge a partial optional-modules patch. Returns { modules } or { error }.
 */
export function parseOptionalModulesPatch(raw) {
  if (raw === undefined) return { modules: undefined };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Optional modules map is required" };
  }
  for (const key of Object.keys(raw)) {
    if (!OPTIONAL_MODULE_ID_SET.has(key)) {
      return { error: `Unknown optional module “${key}”` };
    }
  }
  // Ignore attempts to enable hidden modules (e.g. Board console).
  const scrubbed = { ...raw };
  for (const id of HIDDEN_OPTIONAL_MODULE_IDS) {
    if (Object.prototype.hasOwnProperty.call(scrubbed, id)) scrubbed[id] = false;
  }
  const modules = normalizeOptionalModules(scrubbed);
  return { modules };
}

export function filterFeaturesByOptionalModules(featureList, optionalModules) {
  const mods = normalizeOptionalModules(optionalModules);
  return (featureList || []).filter((id) => !OPTIONAL_MODULE_ID_SET.has(id) || mods[id]);
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

export function featuresForUser(
  user,
  { customRoles = [], roleFeatureAccess = null, optionalModules = null } = {}
) {
  if (!user) return [...ALWAYS_ON_FEATURES];
  let list;
  if (user.role === "PRINCIPAL" || user.role === "PLATFORM_ADMIN") {
    list = enabledFeatureList(Object.fromEntries(FEATURE_IDS.map((id) => [id, true])));
    if (user.role === "PRINCIPAL") {
      list = list.filter((id) => !PRINCIPAL_EXCLUDED_FEATURES.includes(id));
    }
  } else {
    const accessKey = resolveAccessRoleKey(user, customRoles);
    const custom = customRoles.find((r) => r.id === accessKey);
    const baseRole = custom?.baseRole || user.role || "TEACHER";
    const map = effectiveFeatureMap(accessKey || user.role, roleFeatureAccess, { baseRole });
    list = enabledFeatureList(map);
  }
  // Platform admins are not school-scoped; optional modules only apply per school tenant.
  if (user.role === "PLATFORM_ADMIN") return list;
  return filterFeaturesByOptionalModules(list, optionalModules);
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
