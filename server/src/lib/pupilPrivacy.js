/**
 * Pupil erasure, retention, and the principal's processing acknowledgement.
 * Erasure deletes the student row (marks, photos, and enrolments cascade)
 * and revokes portal links that named that student. The audit summary does
 * not repeat the pupil's name.
 */
import { prisma } from "./prisma.js";
import { deleteBlob } from "./blobStore.js";
import { logActivity } from "./activityAudit.js";
import { ensurePrivacySettingsColumn } from "./ensureSchema.js";
import { runWithTenant, runWithoutTenant } from "./tenant.js";

export const RETENTION_MIN_YEARS = 1;
export const RETENTION_MAX_YEARS = 15;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parsePrivacySettings(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const years = src.retentionYears == null || src.retentionYears === "" ? null : Number(src.retentionYears);
  const retentionYears =
    Number.isInteger(years) && years >= RETENTION_MIN_YEARS && years <= RETENTION_MAX_YEARS ? years : null;
  const contact = String(src.contactEmail || "").trim();
  const acknowledged = src.processingAcknowledgedAt ? String(src.processingAcknowledgedAt) : null;
  return {
    retentionYears,
    contactEmail: EMAIL_RE.test(contact) ? contact.slice(0, 200) : null,
    processingAcknowledgedAt: acknowledged && !Number.isNaN(Date.parse(acknowledged)) ? acknowledged : null,
  };
}

export function publicPrivacySettings(raw) {
  return parsePrivacySettings(raw);
}

/**
 * Merge a privacy PATCH. `acknowledgeProcessing: true` stamps the current time.
 * @returns {{ settings: object } | { error: string }}
 */
export function parsePrivacyPatch(body = {}, existing = null, now = new Date()) {
  const next = parsePrivacySettings(existing);
  if (body.retentionYears === null || body.retentionYears === "") {
    next.retentionYears = null;
  } else if (body.retentionYears !== undefined) {
    const years = Number(body.retentionYears);
    if (!Number.isInteger(years) || years < RETENTION_MIN_YEARS || years > RETENTION_MAX_YEARS) {
      return { error: `Retention must be ${RETENTION_MIN_YEARS}–${RETENTION_MAX_YEARS} years, or empty to turn it off` };
    }
    next.retentionYears = years;
  }
  if (body.contactEmail !== undefined) {
    const email = String(body.contactEmail || "").trim();
    if (email && !EMAIL_RE.test(email)) return { error: "Contact email is invalid" };
    next.contactEmail = email ? email.slice(0, 200) : null;
  }
  if (body.acknowledgeProcessing === true) {
    next.processingAcknowledgedAt = now.toISOString();
  }
  return { settings: next };
}

/**
 * End of an academic-year label such as "2024-25": 31 March of the end year, UTC.
 * Returns null when the label is not a year range.
 */
export function academicYearEndUtc(label) {
  const match = String(label || "").trim().match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  let endYear = Number(match[2]);
  if (endYear < 100) {
    endYear = Math.floor(start / 100) * 100 + endYear;
    if (endYear < start) endYear += 100;
  }
  if (endYear < start || endYear > start + 2) return null;
  return new Date(Date.UTC(endYear, 2, 31, 23, 59, 59));
}

export function isDueForRetention(student, retentionYears, now = new Date()) {
  if (!retentionYears) return false;
  if (student?.status !== "LEFT" && student?.status !== "TRANSFERRED") return false;
  const end = academicYearEndUtc(student.academicYear);
  if (!end) return false;
  const due = new Date(end);
  due.setUTCFullYear(due.getUTCFullYear() + retentionYears);
  return now.getTime() >= due.getTime();
}

async function revokePortalLinksForStudent(studentId) {
  const links = await prisma.portalAccessLink.findMany({
    select: { id: true, studentIds: true, revokedAt: true },
  });
  let updated = 0;
  for (const link of links) {
    const ids = Array.isArray(link.studentIds) ? link.studentIds.map(String) : [];
    if (!ids.includes(String(studentId))) continue;
    const remaining = ids.filter((id) => id !== String(studentId));
    await prisma.portalAccessLink.update({
      where: { id: link.id },
      data: remaining.length
        ? { studentIds: remaining }
        : { studentIds: [], revokedAt: link.revokedAt || new Date() },
    });
    updated += 1;
  }
  return updated;
}

/**
 * Delete one pupil and the personal data that hangs off that row.
 * Caller must already be inside the pupil's tenant.
 */
export async function erasePupil(studentId, { actorId } = {}) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, photoStorageKey: true, status: true },
  });
  if (!student) {
    const err = new Error("Student not found");
    err.status = 404;
    throw err;
  }
  if (student.photoStorageKey) {
    try {
      await deleteBlob(student.photoStorageKey);
    } catch {
      // The row delete still removes database bytes.
    }
  }
  const portalLinks = await revokePortalLinksForStudent(student.id);
  await prisma.student.delete({ where: { id: student.id } });
  try {
    await logActivity({
      actorId,
      action: "SCHOOL_DATA_DELETED",
      summary: "Erased one pupil record, including marks, photo, and portal links",
      meta: { kind: "pupil", portalLinks },
    });
  } catch {
    // Erasure already committed; a missing audit row must not restore the pupil.
  }
  return { erased: true, portalLinks };
}

export async function eraseDuePupils({ retentionYears, now = new Date(), limit = 100, actorId } = {}) {
  if (!retentionYears) return { erased: 0, examined: 0 };
  const rows = await prisma.student.findMany({
    where: { status: { in: ["LEFT", "TRANSFERRED"] } },
    select: { id: true, status: true, academicYear: true },
  });
  const due = rows.filter((row) => isDueForRetention(row, retentionYears, now)).slice(0, limit);
  let erased = 0;
  for (const row of due) {
    await erasePupil(row.id, { actorId });
    erased += 1;
  }
  return { erased, examined: rows.length };
}

/** Apply each school's retention rule. Safe to call from the mail cron and the long-running worker. */
export async function applyDueRetention({ now = new Date(), limit = 50 } = {}) {
  await ensurePrivacySettingsColumn();
  return runWithoutTenant(async () => {
    const schools = await prisma.school.findMany({
      select: { id: true, privacySettings: true },
    });
    let erased = 0;
    let schoolsTouched = 0;
    for (const school of schools) {
      if (erased >= limit) break;
      const settings = parsePrivacySettings(school.privacySettings);
      if (!settings.retentionYears) continue;
      const result = await runWithTenant(school.id, () =>
        eraseDuePupils({
          retentionYears: settings.retentionYears,
          now,
          limit: limit - erased,
        })
      );
      if (result.erased) schoolsTouched += 1;
      erased += result.erased;
    }
    return { erased, schools: schoolsTouched };
  });
}
