export const GRADE_BANDS = [
  { grade: "A+", min: 90 },
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

export const PASS_PERCENT = 50;

export function gradeFromPercent(percent) {
  if (percent == null || Number.isNaN(percent)) return null;
  for (const band of GRADE_BANDS) {
    if (percent >= band.min) return band.grade;
  }
  return "F";
}

export function percentOf(marks, maxMarks) {
  if (maxMarks == null || maxMarks <= 0 || marks == null) return null;
  return Math.round((Number(marks) / Number(maxMarks)) * 1000) / 10;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values) {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function pearson(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
}

export function round1(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}
