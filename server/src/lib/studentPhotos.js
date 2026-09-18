/**
 * Helpers for bulk student photo upload matched by admission number filename.
 */

/** Strip path + extension: "folder/ADM-10B-01.jpg" → "ADM-10B-01" */
export function admissionKeyFromFilename(filename) {
  const base = String(filename || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  if (!base) return "";
  const withoutExt = base.replace(/\.[^.]+$/i, "");
  return String(withoutExt || "").trim();
}

/** Case-insensitive, trimmed key for Map lookups. */
export function normalizeAdmissionKey(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Build admissionNo → student map. Duplicate keys are recorded in `duplicates`.
 * @returns {{ byAdmission: Map<string, object>, duplicates: Set<string> }}
 */
export function indexStudentsByAdmission(students) {
  const byAdmission = new Map();
  const duplicates = new Set();
  for (const student of students || []) {
    const raw = student?.admissionNo;
    if (raw == null || String(raw).trim() === "") continue;
    const key = normalizeAdmissionKey(raw);
    if (byAdmission.has(key)) {
      duplicates.add(key);
      continue;
    }
    byAdmission.set(key, student);
  }
  for (const key of duplicates) byAdmission.delete(key);
  return { byAdmission, duplicates };
}

/**
 * Match one uploaded file to a student by filename = admission no.
 * @returns {{ ok: true, student, admissionNo } | { ok: false, error }}
 */
export function matchPhotoFileToStudent(file, { byAdmission, duplicates }) {
  const originalName = file?.originalname || file?.name || "";
  const keyRaw = admissionKeyFromFilename(originalName);
  if (!keyRaw) {
    return { ok: false, error: "Filename must be the admission number (e.g. ADM-10B-01.jpg)" };
  }
  const key = normalizeAdmissionKey(keyRaw);
  if (duplicates?.has(key)) {
    return {
      ok: false,
      error: `Admission no “${keyRaw}” matches more than one student — fix duplicates first`,
    };
  }
  const student = byAdmission?.get(key);
  if (!student) {
    return { ok: false, error: `No student with admission no “${keyRaw}”` };
  }
  return { ok: true, student, admissionNo: student.admissionNo || keyRaw };
}
