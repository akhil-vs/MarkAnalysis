/** Nominal roster size for enrollment bars when no seat cap is stored. */
export const CLASS_ROSTER_NOMINAL = 35;

const SECTION_PILL_TONES = [
  "bg-[#d9e6f4] text-[#2f5680] border-[#b8cfe8]",
  "bg-[#e6dff2] text-[#5a3d7a] border-[#cfc0e4]",
  "bg-[#f3e6c4] text-[#7a5c18] border-[#e5d4a8]",
  "bg-[#d7efe6] text-[#2d6a55] border-[#b8dfd0]",
  "bg-[#f0ddd4] text-[#8a4a2e] border-[#e0c4b8]",
  "bg-[#ebe4f5] text-[#5b3d8a] border-[#d4c8eb]",
];

const AVATAR_TONES = [
  "bg-[#d9e6f4] text-[#2f5680]",
  "bg-[#f3e6c4] text-[#7a5c18]",
  "bg-[#e6dff2] text-[#5a3d7a]",
  "bg-[#d7efe6] text-[#2d6a55]",
  "bg-[#f0ddd4] text-[#8a4a2e]",
];

const ROMAN = [
  ["M", 1000],
  ["CM", 900],
  ["D", 500],
  ["CD", 400],
  ["C", 100],
  ["XC", 90],
  ["L", 50],
  ["XL", 40],
  ["X", 10],
  ["IX", 9],
  ["V", 5],
  ["IV", 4],
  ["I", 1],
];

export function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarTone(seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

export function sectionPillTone(section, className = "") {
  const text = `${className}-${section}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 1)) % SECTION_PILL_TONES.length;
  return SECTION_PILL_TONES[hash];
}

export function classRomanBadge(className) {
  const raw = String(className || "").trim();
  const num = parseInt(raw.replace(/\D/g, ""), 10);
  if (Number.isFinite(num) && num > 0 && num <= 3999) {
    let n = num;
    let out = "";
    for (const [sym, val] of ROMAN) {
      while (n >= val) {
        out += sym;
        n -= val;
      }
    }
    return out || raw.slice(0, 3).toUpperCase();
  }
  return raw.slice(0, 3).toUpperCase() || "—";
}

export function classTierLabel(className) {
  const num = parseInt(String(className || "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(num)) return "School tier";
  if (num <= 5) return "Primary tier";
  if (num <= 8) return "Middle school tier";
  if (num <= 10) return "Secondary diploma track";
  if (num <= 12) return "Senior secondary track";
  return "School tier";
}

export function rosterCapacity(students) {
  const count = Math.max(0, Number(students) || 0);
  const cap = Math.max(CLASS_ROSTER_NOMINAL, count);
  const pct = cap === 0 ? 0 : Math.min(100, Math.round((count / cap) * 100));
  return { count, cap, pct };
}

export function rosterBarTone(pct, hasTeacher) {
  if (!hasTeacher) return "bg-ink-700/25";
  if (pct >= 100) return "bg-clay-500";
  if (pct >= 85) return "bg-moss-500";
  if (pct >= 50) return "bg-[#4a7fc1]";
  if (pct > 0) return "bg-clay-500/80";
  return "bg-ink-900/10";
}

export function classSectionStatus(row) {
  const students = row?._count?.students ?? 0;
  const hasTeacher = Boolean(row?.classTeacherId);
  const { pct } = rosterCapacity(students);

  if (!hasTeacher) {
    return {
      key: "needs_faculty",
      label: "Needs faculty",
      dotClass: "bg-[#4a7fc1]",
      className: "bg-ink-900/8 text-ink-700/65 border border-ink-900/10",
    };
  }
  if (students === 0) {
    return {
      key: "roster_open",
      label: "Roster open",
      dotClass: "bg-clay-500",
      className: "bg-clay-500/20 text-clay-700 border border-clay-500/25",
    };
  }
  if (pct >= 100) {
    return {
      key: "at_capacity",
      label: "At capacity",
      dotClass: "bg-clay-600",
      className: "bg-clay-500/15 text-clay-700 border border-clay-500/30",
    };
  }
  return {
    key: "active",
    label: "Active",
    dotClass: "bg-moss-500",
    className: "bg-moss-500/15 text-moss-700 border border-moss-500/25",
  };
}

export function sectionsByClassName(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.className || "");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(a.section).localeCompare(String(b.section), undefined, { numeric: true }));
  }
  return map;
}

export function exportClassesCsv(rows, filename = "class-sections.csv") {
  const header = ["Class", "Section", "Class teacher", "Students", "Status"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const status = classSectionStatus(row).label;
    const cells = [
      row.className,
      row.section,
      row.classTeacher?.name || "",
      String(row._count?.students ?? 0),
      status,
    ].map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
