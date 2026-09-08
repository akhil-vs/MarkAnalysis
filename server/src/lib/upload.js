import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

export function parseSpreadsheet(buffer, originalname) {
  const name = (originalname || "").toLowerCase();
  if (name.endsWith(".csv")) {
    return parse(buffer.toString("utf8"), { columns: true, skip_empty_lines: true, trim: true });
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

/**
 * Excel/CSV often strip leading zeros from roll numbers ("01" → "1").
 * Normalize for matching while keeping the school-stored roll for display.
 */
export function normalizeRollKey(roll) {
  const text = String(roll ?? "").trim();
  if (!text) return "";
  const stripped = text.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

/** Map students by exact roll and by zero-stripped roll for spreadsheet matching. */
export function studentRollIndex(students) {
  const byRoll = new Map();
  for (const student of students) {
    const exact = String(student.rollNo ?? "").trim();
    if (exact) byRoll.set(exact, student);
    const key = normalizeRollKey(exact);
    if (key && !byRoll.has(key)) byRoll.set(key, student);
  }
  return byRoll;
}

export function findStudentByRoll(byRoll, roll) {
  const exact = String(roll ?? "").trim();
  if (!exact) return null;
  return byRoll.get(exact) || byRoll.get(normalizeRollKey(exact)) || null;
}

export function cell(row, ...names) {
  const entries = Object.entries(row || {});
  const normalized = new Map(
    entries.map(([k, v]) => [String(k).toLowerCase().replace(/[\s_]+/g, ""), v])
  );
  for (const name of names) {
    const key = String(name).toLowerCase().replace(/[\s_]+/g, "");
    const value = normalized.get(key);
    if (value == null || value === "") continue;
    return typeof value === "string" ? value.trim() : value;
  }
  return "";
}

export function parseDob(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + raw * 86400000);
  }
  const text = String(raw).trim();
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}
