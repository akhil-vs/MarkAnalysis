import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";
import { ExamSelect, YearComparison } from "../components/AnalysisPanels.jsx";
import { GRADE_COLORS, Metric, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

const COLORS = ["#1b2437", "#c45c26", "#3d6b4f", "#7a5c3a"];

function subjectStatSearchText(r) {
  return searchHaystack(r.subject, r.average, r.median, r.highest, r.lowest, r.passRate);
}

function rankSearchText(s) {
  return searchHaystack(s.name, s.rank, s.average, s.grade, s.classLabel);
}

function SearchableSubjectStats({ rows }) {
  const table = useTableSearch(rows, { getSearchText: subjectStatSearchText });
  return (
    <>
      <div className="mb-3">
        <TableToolbar
          q={table.q}
          setQ={table.setQ}
          placeholder="Search subject"
          matched={table.matched}
          total={table.total}
        />
      </div>
      <PaginatedTable items={table.filtered} resetKey={table.resetKey} empty="No subject marks yet.">
        {(page) => (
          <table className="table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Avg</th>
                <th>Med</th>
                <th>High</th>
                <th>Low</th>
                <th>Pass</th>
              </tr>
            </thead>
            <tbody>
              {page.map((r) => (
                <tr key={r.subject}>
                  <td>{r.subject}</td>
                  <td>{r.average ?? "—"}</td>
                  <td>{r.median ?? "—"}</td>
                  <td>{r.highest ?? "—"}</td>
                  <td>{r.lowest ?? "—"}</td>
                  <td>{r.passRate ?? "—"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PaginatedTable>
    </>
  );
}

function SearchableRankTable({ rows, showRank = true, showClass = true }) {
  const table = useTableSearch(rows, { getSearchText: rankSearchText });
  return (
    <>
      <div className="mb-3">
        <TableToolbar
          q={table.q}
          setQ={table.setQ}
          placeholder="Search student or class"
          matched={table.matched}
          total={table.total}
        />
      </div>
      <PaginatedTable
        items={table.filtered}
        pageSize={10}
        pageSizeOptions={[10, 25]}
        resetKey={table.resetKey}
        empty="No rankings yet."
      >
        {(page) => (
          <table className="table">
            <tbody>
              {page.map((s) => (
                <tr key={s.studentId}>
                  {showRank && <td>{s.rank}</td>}
                  <td><Link className="underline" to={`/students/${s.studentId}`}>{s.name}</Link></td>
                  {showClass && <td>{s.classLabel}</td>}
                  <td>{s.average}%</td>
                  <td>{s.grade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PaginatedTable>
    </>
  );
}

export default function ClassGroupAnalytics() {
  const { className } = useParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(eid) {
    const res = await api(`/api/analytics/class-group/${encodeURIComponent(className)}${eid ? `?examId=${eid}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, [className]);

  if (!data) return <p>Loading class…</p>;
  if (data.empty) return <p>No data for this class yet.</p>;
  const grades = Object.entries(data.gradeDist || {}).map(([grade, count]) => ({ grade, count }));

  return (
    <div>
      <PageHeader
        title={data.label}
        subtitle={`${data.kpis.sections} divisions · ${data.exam.name} · ${data.exam.academicYear || ""}`}
        actions={<ExamSelect exams={data.exams} value={examId} onChange={load} />}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric label="Class average" value={data.kpis.average != null ? `${data.kpis.average}%` : "—"} />
        <Metric label="Pass rate" value={data.kpis.passRate != null ? `${data.kpis.passRate}%` : "—"} />
        <Metric label="Students" value={data.kpis.students} />
        <Metric label="Highest paper" value={data.kpis.highest != null ? `${data.kpis.highest}%` : "—"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Divisions">
          <div className="space-y-3">
            {(data.divisions || []).map((d) => (
              <Link key={d.id} to={`/classes/${d.id}`} className="block rounded-lg border border-ink-900/10 p-3 hover:border-clay-500">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{d.label}</span>
                  <span>{d.average ?? "—"}% · {d.passRate ?? "—"}% pass</span>
                </div>
                <div className="text-[11px] text-ink-700/55 mt-1">
                  {d.teacher || "No class teacher"}{d.topStudent ? ` · top ${d.topStudent.name}` : ""}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Grade mix">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={grades}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="grade" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                {grades.map((g) => (
                  <Cell key={g.grade} fill={GRADE_COLORS[g.grade] || "#1b2437"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Subject stats">
          <SearchableSubjectStats rows={data.perSubject} />
        </Panel>
        <Panel title="Division comparison">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={data.radar}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <PolarRadiusAxis domain={[0, 100]} />
              {(data.sections || []).map((sec, i) => (
                <Radar key={sec} name={sec} dataKey={sec} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.12} />
              ))}
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="mb-4">
        <YearComparison series={data.yearComparison} title="This class versus previous years" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Top 10">
          <SearchableRankTable rows={data.top10} showRank showClass />
        </Panel>
        <Panel title="Bottom 10">
          <SearchableRankTable rows={data.bottom10} showRank={false} showClass />
        </Panel>
      </div>
    </div>
  );
}
