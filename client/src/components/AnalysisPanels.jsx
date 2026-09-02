import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip, EmptyNote, Panel } from "./DashboardKit.jsx";
import { PaginatedTable } from "./PaginatedTable.jsx";
import { examLabel } from "../lib/exams.js";

export function ExamSelect({ exams = [], value, onChange }) {
  return (
    <select className="field w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      {exams.map((exam) => (
        <option key={exam.id} value={exam.id}>{examLabel(exam)}</option>
      ))}
    </select>
  );
}

export function YearComparison({ series, title = "Compared with previous years" }) {
  if (!series?.length) return null;
  const hasYears = new Set(series.map((s) => s.academicYear).filter(Boolean)).size > 1;
  return (
    <Panel title={title}>
      {!hasYears ? (
        <EmptyNote>Only one academic year is on record for this exam type, so there is nothing to compare yet.</EmptyNote>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="academicYear" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="average" name="Average %" fill="#1b2437" radius={[4, 4, 0, 0]} />
              <Bar dataKey="passRate" name="Pass %" fill="#3d6b4f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Exam</th>
                  <th>Average</th>
                  <th>Pass</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {series.map((row, i) => {
                  const prev = series[i - 1];
                  const diff =
                    row.average != null && prev?.average != null
                      ? Math.round((row.average - prev.average) * 10) / 10
                      : null;
                  return (
                    <tr key={row.examId}>
                      <td>{row.academicYear || "—"}</td>
                      <td>{row.examName}</td>
                      <td>{row.average ?? "—"}%</td>
                      <td>{row.passRate ?? "—"}%</td>
                      <td className={diff > 0 ? "text-moss-600" : diff < 0 ? "text-clay-600" : ""}>
                        {diff == null ? "—" : `${diff > 0 ? "+" : ""}${diff}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

export function TeacherCompareTable({ rows = [], empty = "Need two or more teachers of this subject to compare." }) {
  const list = Array.isArray(rows) ? rows : rows.teachers || [];
  return (
    <PaginatedTable items={list} empty={empty}>
      {(page) => (
        <table className="table">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Classes</th>
              <th>Average</th>
              <th>Pass</th>
              <th>vs peers</th>
            </tr>
          </thead>
          <tbody>
            {page.map((row) => (
              <tr key={row.teacherId || `${row.teacher}-${row.classLabel}`}>
                <td className="font-medium">{row.teacher}</td>
                <td className="text-ink-700/70">
                  {row.classLabels?.join(", ") || row.classLabel || "—"}
                </td>
                <td>{row.average ?? "—"}%</td>
                <td>{row.passRate ?? "—"}%</td>
                <td className={row.delta > 0 ? "text-moss-600" : row.delta < 0 ? "text-clay-600" : ""}>
                  {row.delta == null ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PaginatedTable>
  );
}

export function comparableNote(comparable, subject) {
  if (comparable) return null;
  return (
    <EmptyNote>
      {subject
        ? `${subject} is currently taught by one teacher, so a same-subject teacher comparison is not available.`
        : "A teacher comparison appears when two or more teachers mark the same subject."}
    </EmptyNote>
  );
}
