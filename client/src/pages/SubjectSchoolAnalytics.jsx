import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";
import { ExamSelect, TeacherCompareTable, YearComparison, comparableNote } from "../components/AnalysisPanels.jsx";
import { GRADE_COLORS, Metric, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";

export default function SubjectSchoolAnalytics() {
  const { name } = useParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(eid) {
    const res = await api(`/api/analytics/subject-by-name/${encodeURIComponent(name)}${eid ? `?examId=${eid}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, [name]);

  if (!data) return <p>Loading subject…</p>;
  if (data.empty) return <p>No data for this subject yet.</p>;

  const grades = Object.entries(data.gradeDist || {}).map(([grade, count]) => ({ grade, count }));
  const teachers = data.teacherCompare?.teachers || [];

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={`Whole-school analysis · ${data.exam.name} · ${data.exam.academicYear || ""}`}
        actions={<ExamSelect exams={data.exams} value={examId} onChange={load} />}
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric label="School average" value={data.kpis.average != null ? `${data.kpis.average}%` : "—"} />
        <Metric label="Pass rate" value={data.kpis.passRate != null ? `${data.kpis.passRate}%` : "—"} />
        <Metric label="Papers marked" value={data.kpis.count} />
        <Metric
          label="Teachers"
          value={teachers.length}
          hint={teachers.length >= 2 ? { text: "Same-subject comparison available", tone: "up" } : { text: "One teacher on record", tone: "flat" }}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel title="By class">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.byClass}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="average" name="Average" fill="#1b2437" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
        <Panel title="Division-wise">
          <div className="space-y-2">
            {(data.byDivision || []).map((row) => (
              <Link key={row.classSectionId} to={`/classes/${row.classSectionId}`} className="flex justify-between text-sm py-1.5 border-t border-ink-900/10 first:border-0 hover:underline">
                <span>{row.label}</span>
                <span>{row.average ?? "—"}% · {row.passRate ?? "—"}% pass</span>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel
          title="Teachers of this subject"
          action={
            data.teacherCompare?.comparable ? (
              <Link className="text-xs underline text-ink-700/60" to={`/analysis/compare?tab=teachers&subject=${encodeURIComponent(data.name)}`}>
                Open comparison
              </Link>
            ) : null
          }
        >
          {comparableNote(data.teacherCompare?.comparable, data.name)}
          <TeacherCompareTable rows={teachers} />
          {data.teacherCompare?.spread != null && data.teacherCompare.comparable && (
            <p className="text-xs text-ink-700/60 mt-3">
              Spread between teachers is {data.teacherCompare.spread} points.
              {data.teacherCompare.leader ? ` ${data.teacherCompare.leader.teacher} leads.` : ""}
            </p>
          )}
        </Panel>
      </div>

      <YearComparison series={data.yearComparison} title={`${data.name} versus previous years`} />
    </div>
  );
}
