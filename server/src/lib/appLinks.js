/** Canonical SPA paths used in notification deep-links (keep in sync with client/src/lib/nav.js `paths`). */

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
