import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, download } from "../api.js";
import Breadcrumb from "../components/Breadcrumb.jsx";
import { Kpi, PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { examLabel } from "../lib/exams.js";
import { NAV_LABELS } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

const COLORS = ["#1b2437", "#c45c26", "#3d6b4f", "#7a5c3a", "#4a6fa5"];

function subjectSeriesSearchText(row) {
  return searchHaystack(row.subject, row.average, ...(row.points || []).map((p) => [p.exam, p.percent, p.grade]));
}

function SubjectSeriesTable({ rows, examNames }) {
  const table = useTableSearch(rows, { getSearchText: subjectSeriesSearchText });
  return (
    <>
      <div className="p-3 border-b border-ink-900/10">
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
                <th>Average</th>
                {examNames.map((n) => <th key={n}>{n}</th>)}
              </tr>
            </thead>
            <tbody>
              {page.map((row) => (
                <tr key={row.subject}>
                  <td>{row.subject}</td>
                  <td>{row.average}%</td>
                  {examNames.map((n) => {
                    const p = row.points.find((x) => x.exam === n);
                    return <td key={n}>{p ? `${p.percent}% ${p.grade}` : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PaginatedTable>
    </>
  );
}

export default function StudentAnalytics() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");

  useEffect(() => {
    api(`/api/analytics/student/${id}`).then(setData);
    api("/api/exams").then((e) => {
      setExams(e);
      if (e[0]) setExamId(e.at(-1).id);
    });
  }, [id]);

  if (!data) return <p>Loading student…</p>;
  const s = data.student;
  const examNames = [...new Set(data.subjectSeries.flatMap((x) => x.points.map((p) => p.exam)))];
  const lineData = examNames.map((exam) => {
    const row = { exam };
    for (const series of data.subjectSeries) {
      const point = series.points.find((p) => p.exam === exam);
      row[series.subject] = point?.percent ?? null;
    }
    return row;
  });

  return (
    <div>
      <PageHeader
        title={s.name}
        subtitle={`Roll ${s.rollNo} · ${s.classSection.className}-${s.classSection.section}`}
        breadcrumb={
          <Breadcrumb
            items={[
              { label: NAV_LABELS.analysis, to: "/analysis" },
              { label: NAV_LABELS.analysisStudents, to: "/analysis/students" },
              { label: s.name },
            ]}
          />
        }
        actions={
          <>
            <select className="field-filter" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => <option key={e.id} value={e.id}>{examLabel(e)}</option>)}
            </select>
            <button
              className="btn-ghost"
              onClick={() => download(`/api/exports/report-card/${id}?examId=${examId}`, "report-card.pdf")}
            >
              PDF report card
            </button>
          </>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Latest average" value={data.latestAverage != null ? `${data.latestAverage}%` : "—"} />
        <Kpi label="Grade" value={data.latestGrade} />
        <Kpi label="Class rank" value={data.rank ? `${data.rank} / ${data.classSize}` : "—"} />
        <Kpi label="Strongest / weakest" value={`${data.strongest?.subject || "—"} / ${data.weakest?.subject || "—"}`} />
      </div>
      <div className="card p-4 mb-4">
        <h3 className="font-serif text-lg mb-3">Subject trends</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={lineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
            <XAxis dataKey="exam" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            {data.subjectSeries.map((series, i) => (
              <Line key={series.subject} type="monotone" dataKey={series.subject} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <SubjectSeriesTable rows={data.subjectSeries} examNames={examNames} />
      </div>
    </div>
  );
}
