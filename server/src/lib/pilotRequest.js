import { parseEmail } from "./numbers.js";

const STATUSES = new Set(["PENDING", "CONTACTED", "DECLINED", "PROVISIONED"]);

export function isPilotRequestStatus(value) {
  return STATUSES.has(String(value || ""));
}

export function publicPilotRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    schoolName: row.schoolName,
    board: row.board || null,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone || null,
    roleTitle: row.roleTitle || null,
    examNameOrType: row.examNameOrType || null,
    targetClasses: row.targetClasses || null,
    preferredStartDate: row.preferredStartDate || null,
    notes: row.notes || null,
    status: row.status,
    schoolId: row.schoolId || null,
    reviewedById: row.reviewedById || null,
    reviewedAt: row.reviewedAt || null,
    reviewNote: row.reviewNote || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function trimOptional(value, max = 200) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

/**
 * Validate a public pilot request payload.
 * @returns {{ error: string } | { value: object }}
 */
export function parsePilotRequestBody(body = {}) {
  const schoolName = String(body.schoolName || "").trim();
  if (!schoolName) return { error: "School name is required" };
  if (schoolName.length < 2) return { error: "School name is too short" };

  const contactName = String(body.contactName || "").trim();
  if (!contactName) return { error: "Your name is required" };

  const email = parseEmail(body.contactEmail, { required: true, label: "Email" });
  if (email.error) return { error: email.error };

  return {
    value: {
      schoolName: schoolName.slice(0, 160),
      board: trimOptional(body.board, 80),
      contactName: contactName.slice(0, 120),
      contactEmail: email.value,
      contactPhone: trimOptional(body.contactPhone, 40),
      roleTitle: trimOptional(body.roleTitle, 80),
      examNameOrType: trimOptional(body.examNameOrType, 120),
      targetClasses: trimOptional(body.targetClasses, 200),
      preferredStartDate: trimOptional(body.preferredStartDate, 40),
      notes: trimOptional(body.notes, 2000),
    },
  };
}

export function pilotNotifyEmail(env = process.env) {
  return String(env.PILOT_NOTIFY_EMAIL || env.VITE_PILOT_CONTACT_EMAIL || "").trim() || null;
}
