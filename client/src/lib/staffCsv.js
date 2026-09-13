export const STAFF_CSV_HEADERS = ["Name", "Email", "School ID", "Password", "Role"];

export function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildStaffImportTemplateCsv({
  example = ["Ramesh Chandra", "ramesh@school.edu", "SCH-T06", "password123", "TEACHER"],
} = {}) {
  return (
    [STAFF_CSV_HEADERS, example]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}

export function downloadStaffImportTemplate() {
  const blob = new Blob([`\uFEFF${buildStaffImportTemplateCsv()}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "staff-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * Parse a staff bulk-import CSV.
 * @param {string} text
 * @param {{ generatePassword?: () => string }} [options]
 */
export function parseStaffCsv(text, { generatePassword } = {}) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { error: "CSV file is empty" };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ""));
  const hasHeader = header.some((h) =>
    ["name", "fullname", "email", "schoolid", "password", "role"].includes(h)
  );
  const rows = [];
  const start = hasHeader ? 1 : 0;
  const idx = (keys, fallback) => {
    for (const key of keys) {
      const i = header.indexOf(key);
      if (i >= 0) return i;
    }
    return fallback;
  };
  const nameIdx = hasHeader ? idx(["name", "fullname"], 0) : 0;
  const emailIdx = hasHeader ? idx(["email", "emailaddress"], 1) : 1;
  const schoolIdx = hasHeader ? idx(["schoolid", "id"], 2) : 2;
  const passwordIdx = hasHeader ? idx(["password", "temporarypassword", "temppassword"], 3) : 3;
  const roleIdx = hasHeader ? idx(["role", "assignedrole"], 4) : 4;
  const fallbackPassword = typeof generatePassword === "function" ? generatePassword : () => "";

  for (let i = start; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    if (!cells.some(Boolean)) continue;
    rows.push({
      name: cells[nameIdx] || "",
      email: cells[emailIdx] || "",
      schoolId: cells[schoolIdx] || "",
      password: cells[passwordIdx] || fallbackPassword(),
      role: (cells[roleIdx] || "TEACHER").toUpperCase().replace(/\s+/g, "_"),
    });
  }
  if (!rows.length) return { error: "No staff rows found in CSV" };
  return { rows };
}
