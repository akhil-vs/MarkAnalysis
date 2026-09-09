/**
 * Canonical SPA paths for notification deep-links.
 * Keep in sync with `client/src/lib/nav.js` `paths` — enforced by appLinks.sync.test.js.
 */

export function marksRegisterLink({ examId, classSectionId, subjectId } = {}) {
  const params = new URLSearchParams();
  if (examId) params.set("examId", examId);
  if (classSectionId) params.set("classSectionId", classSectionId);
  if (subjectId) params.set("subjectId", subjectId);
  const q = params.toString();
  return q ? `/marks?${q}` : "/marks";
}

export function pendingUploadsLink({ examId } = {}) {
  return examId ? `/pending-uploads?examId=${encodeURIComponent(examId)}` : "/pending-uploads";
}

export function accessRequestsLink({ status = "PENDING", kind, examId } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  if (examId) params.set("examId", examId);
  const q = params.toString();
  return q ? `/late-entry?${q}` : "/late-entry";
}

export function classSectionAnalysisLink(id) {
  return `/analysis/classes/${id}`;
}

export function studentAnalysisLink(id) {
  return `/analysis/students/${id}`;
}

export function teacherAnalysisLink(id) {
  return `/analysis/teachers/${id}`;
}

export function classGroupAnalysisLink(className) {
  return `/analysis/classes/group/${encodeURIComponent(className)}`;
}

export function subjectByNameLink(name) {
  return `/analysis/subjects/name/${encodeURIComponent(name)}`;
}

export function compareTeachersLink(subject) {
  return `/analysis/compare?tab=teachers&subject=${encodeURIComponent(subject)}`;
}
