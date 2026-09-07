import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { api, download } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ExamSelect, YearComparison } from "../components/AnalysisPanels.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { isLeadership } from "../lib/roles.js";
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
                <th>Status</th>
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
                  <td>{r.passRate != null ? `${r.passRate}%` : "—"}</td>
                  <td className="text-xs text-ink-700/60">
                    {r.provisional
                      ? `Draft (${r.draftCount}) — approve to publish`
                      : r.approvedCount
                        ? `${r.approvedCount} approved`
                        : "No marks"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PaginatedTable>
    </>
  );
}

function SearchableRankTable({ rows, showRank = true }) {
  const table = useTableSearch(rows, { getSearchText: rankSearchText });
  return (
    <>
      <div className="mb-3">
        <TableToolbar
          q={table.q}
          setQ={table.setQ}
          placeholder="Search student"
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

export default function ClassAnalytics() {
  const { id } = useParams();
  const { user } = useAuth();
  const leadership = isLeadership(user.role);
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(eid) {
    const res = await api(`/api/analytics/class/${id}${eid ? `?examId=${eid}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, [id]);

  if (!data) return <p>Loading class…</p>;
  if (data.empty) return <p>No data for this class yet.</p>;
  const grades = Object.entries(data.gradeDist || {}).map(([grade, count]) => ({ grade, count }));

  return (
    <div>
      <PageHeader
        title={`${data.classSection.className}-${data.classSection.section}`}
        subtitle={data.exam.name}
        actions={
          <>
            <ExamSelect exams={data.exams} value={examId} onChange={load} />
            {leadership && (
              <Link className="btn-primary" to={`/consolidated?examId=${examId}&class=${id}`}>
                Consolidated list
              </Link>
            )}
            <button
              className="btn-ghost"
              onClick={() => download(`/api/exports/class-summary/${id}?examId=${examId}`, "class-summary.pdf")}
            >
              Printable summary
            </button>
          </>
        }
      />

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-4">
          <h3 className="font-serif text-lg mb-3">Subject stats</h3>
          <SearchableSubjectStats rows={data.perSubject} />
        </div>
        <div className="card p-4">
          <h3 className="font-serif text-lg mb-3">Grade histogram</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={grades}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="grade" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#c45c26" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-4">
        <YearComparison series={data.yearComparison} title="This division versus previous years" />
      </div>

      <div className="card p-4 mb-4">
        <h3 className="font-serif text-lg mb-3">Section comparison</h3>
        <ResponsiveContainer width="100%" height={320}>
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
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-serif text-lg mb-3">Top 10</h3>
          <SearchableRankTable rows={data.top10} showRank />
        </div>
        <div className="card p-4">
          <h3 className="font-serif text-lg mb-3">Bottom 10</h3>
          <SearchableRankTable rows={data.bottom10} showRank={false} />
        </div>
      </div>
    </div>
  );
}
