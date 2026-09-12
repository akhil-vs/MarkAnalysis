import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";

function excelCellToString(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.richText) {
      return value.richText.map((part) => part.text || "").join("").trim();
    }
    if (value.hyperlink && value.text != null) return String(value.text).trim();
  }
  return String(value).trim();
}

async function parseExcelBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(row.values || []);
  });
  if (!rows.length) return [];

  const headerRow = rows[0];
  const headers = [];
  for (let i = 1; i < headerRow.length; i += 1) {
    headers[i] = excelCellToString(headerRow[i]);
  }

  const out = [];
  for (let r = 1; r < rows.length; r += 1) {
    const values = rows[r];
    const obj = {};
    let hasValue = false;
    for (let i = 1; i < headers.length; i += 1) {
      const key = headers[i];
      if (!key) continue;
      const cellValue = excelCellToString(values[i]);
      obj[key] = cellValue;
      if (cellValue !== "") hasValue = true;
    }
    if (hasValue) out.push(obj);
  }
  return out;
}

/** Parse CSV or .xlsx uploads into an array of row objects (header keys preserved). */
export async function parseSpreadsheet(buffer, originalname) {
  const name = (originalname || "").toLowerCase();
  if (name.endsWith(".csv")) {
    return parse(buffer.toString("utf8"), { columns: true, skip_empty_lines: true, trim: true });
  }
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) {
    const err = new Error("Legacy .xls uploads are not supported. Save as .xlsx or CSV and try again.");
    err.status = 400;
    throw err;
  }
  return parseExcelBuffer(buffer);
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
