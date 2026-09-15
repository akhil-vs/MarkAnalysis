/** Feature ids toggled by principals under Staff → role access. Must match server catalog. */
export const FEATURE_GROUPS = [
  {
    id: "Marks",
    items: [
      { id: "marks", label: "Mark register" },
      { id: "upload", label: "Bulk upload" },
      { id: "pendingUploads", label: "Pending uploads" },
      { id: "accessRequests", label: "Access requests" },
      { id: "consolidated", label: "Consolidated lists" },
      { id: "audit", label: "Audit log" },
    ],
  },
  {
    id: "Insights",
    items: [
      { id: "analysis", label: "Marks analysis" },
      { id: "analysisSchool", label: "School overview" },
      { id: "analysisClasses", label: "Class analysis" },
      { id: "analysisSubjects", label: "Subject analysis" },
      { id: "analysisTeachers", label: "Teacher analysis" },
      { id: "analysisStudents", label: "Student analysis" },
      { id: "analysisCompare", label: "Compare" },
      { id: "analysisDeep", label: "Deep insights" },
    ],
  },
  {
    id: "School setup",
    items: [
      { id: "staff", label: "Staff" },
      { id: "records", label: "School records" },
      { id: "timetables", label: "Timetables" },
      { id: "schoolProfile", label: "School profile" },
      { id: "boardOps", label: "Board ops" },
      { id: "cpd", label: "CPD" },
    ],
  },
];

/** Hidden school-wide until principal enables under School profile → Optional modules. */
export const OPTIONAL_MODULE_IDS = ["boardOps", "cpd"];

export const ALWAYS_ON_FEATURES = ["dashboard", "profile"];

export function hasFeature(features, featureId) {
  if (!featureId || ALWAYS_ON_FEATURES.includes(featureId)) return true;
  if (!Array.isArray(features)) return true; // until session loads features, don't blank the UI
  return features.includes(featureId);
}

/** Nav item id → feature id (same id for catalog features). */
export function featureForNavId(navId) {
  if (!navId) return null;
  if (ALWAYS_ON_FEATURES.includes(navId)) return navId;
  return navId;
}

export function isOptionalModuleEnabled(optionalModules, featureId) {
  if (!OPTIONAL_MODULE_IDS.includes(featureId)) return true;
  return Boolean(optionalModules?.[featureId]);
}
