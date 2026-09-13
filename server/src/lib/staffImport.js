import { randomBytes } from "node:crypto";
import { cell } from "./upload.js";
import { parseEmail } from "./numbers.js";

export const STAFF_IMPORT_HEADERS = ["Name", "Email", "School ID", "Password", "Role"];

export function generateStaffTempPassword(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function normalizeStaffRole(raw) {
  const role = String(raw || "TEACHER")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (role === "EXAM_COORDINATOR" || role === "COORDINATOR") return "EXAM_COORDINATOR";
  if (role === "TEACHER" || !role) return "TEACHER";
  return role;
}

/**
 * Map spreadsheet row objects (from parseSpreadsheet) into staff import rows.
 * @param {object[]} rows
 * @param {{ generatePassword?: () => string }} [options]
 */
export function mapStaffImportRows(rows, { generatePassword } = {}) {
  const fallbackPassword =
    typeof generatePassword === "function" ? generatePassword : generateStaffTempPassword;
  const mapped = [];
  const errors = [];

  (rows || []).forEach((row, index) => {
    const line = index + 2;
    const name = String(cell(row, "Name", "Full Name", "fullname") || "").trim();
    let email = String(cell(row, "Email", "Email Address") || "").trim();
    const schoolId = String(cell(row, "School ID", "SchoolId", "ID") || "").trim();
    const passwordRaw = String(
      cell(row, "Password", "Temporary Password", "Temp Password") || ""
    ).trim();
    const roleRaw = cell(row, "Role", "Assigned Role");

    if (!name && !email && !schoolId) return;

    if (!name) {
      errors.push({ row: line, error: "Name is required" });
      return;
    }
    if (!email && !schoolId) {
      errors.push({ row: line, error: "Provide an email or school ID" });
      return;
    }
    if (email) {
      const parsedEmail = parseEmail(email, { required: true });
      if (parsedEmail.error) {
        errors.push({ row: line, error: parsedEmail.error });
        return;
      }
      email = parsedEmail.value;
    }

    const password = passwordRaw || fallbackPassword();
    if (String(password).length < 8) {
      errors.push({ row: line, error: "Password must be at least 8 characters" });
      return;
    }

    const role = normalizeStaffRole(roleRaw);
    if (role !== "TEACHER" && role !== "EXAM_COORDINATOR") {
      errors.push({ row: line, error: "Role must be Teacher or Exam Coordinator" });
      return;
    }

    mapped.push({
      row: line,
      name,
      email: email || null,
      schoolId: schoolId || null,
      password,
      role,
    });
  });

  if (!mapped.length && !errors.length) {
    return { error: "No staff rows found in file", rows: [], errors: [] };
  }
  return { rows: mapped, errors };
}
