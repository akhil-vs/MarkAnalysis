export const HUB_TABS = [
  { id: "class", label: "Class-wise" },
  { id: "division", label: "Division-wise" },
  { id: "subject", label: "Subject-wise" },
];

export const SORT_OPTIONS = [
  { id: "average", label: "Average Score" },
  { id: "passRate", label: "Pass Rate" },
  { id: "enrollment", label: "Enrollment" },
];

/**
 * Status pill relative to the school-wide average (target).
 * Missing averages mean registers are still open / grading incomplete.
 */
export function benchmarkStatus(average, schoolTarget) {
  if (average == null || Number.isNaN(Number(average))) {
    return { text: "Grading in progress", tone: "neutral" };
  }
  const avg = Number(average);
  const target = schoolTarget != null ? Number(schoolTarget) : null;
  if (target == null || Number.isNaN(target)) {
    if (avg >= 75) return { text: "Above school target", tone: "up" };
    if (avg >= 60) return { text: "Approaching benchmark", tone: "warn" };
    return { text: "Below benchmark", tone: "down" };
  }
  if (avg >= target) return { text: "Above school target", tone: "up" };
  if (avg >= target - 5) return { text: "Approaching benchmark", tone: "warn" };
  return { text: "Below benchmark", tone: "down" };
}

export function sortHubRows(rows, sortBy) {
  const sorted = [...rows];
  const key = sortBy === "passRate" ? "passRate" : sortBy === "enrollment" ? "enrollment" : "average";
  sorted.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return (a.label || "").localeCompare(b.label || "");
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
  return sorted;
}

export function filterHubRows(rows, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => (row.searchText || row.label || "").toLowerCase().includes(q));
}
