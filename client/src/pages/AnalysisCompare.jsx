import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { api } from "../api.js";
import { ExamSelect, TeacherCompareTable, YearComparison } from "../components/AnalysisPanels.jsx";
import { ChartTooltip, EmptyNote, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";

export default function AnalysisCompare() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "teachers" ? "teachers" : "years";
  const [years, setYears] = useState(null);
  const [teachers, setTeachers] = useState(null);
  const [examId, setExamId] = useState("");
  const [className, setClassName] = useState(params.get("class") || "");
  const [subjectName, setSubjectName] = useState(params.get("subject") || "");

  function setTab(next) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", next);
    setParams(nextParams);
  }

  async function loadYears(id = examId, cls = className, subject = subjectName) {
    const q = new URLSearchParams();
    if (id) q.set("examId", id);
    if (cls) q.set("className", cls);
    if (subject) q.set("subjectName", subject);
    const res = await api(`/api/analytics/compare/years?${q}`);
    setYears(res);
    if (res.exam) setExamId(res.exam.id);
  }

  async function loadTeachers(id = examId, cls = className, subject = subjectName) {
    const q = new URLSearchParams();
    if (id) q.set("examId", id);
    if (cls) q.set("className", cls);
    if (subject) q.set("subjectName", subject);
    const res = await api(`/api/analytics/compare/teachers?${q}`);
    setTeachers(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    loadYears();
    loadTeachers();
  }, []);

  function onExam(id) {
    setExamId(id);
    loadYears(id, className, subjectName);
    loadTeachers(id, className, subjectName);
  }

  function onClass(value) {
    setClassName(value);
    loadYears(examId, value, subjectName);
    loadTeachers(examId, value, subjectName);
  }

  function onSubject(value) {
    setSubjectName(value);
    loadYears(examId, className, value);
    loadTeachers(examId, className, value);
  }

  const classChart = useMemo(() => {
    if (!years?.byClass) return [];
    const yearsKeys = years.school?.map((s) => s.academicYear) || [];
    return years.byClass.map((row) => {
      const point = { label: row.label };
      for (const y of row.years) point[y.academicYear] = y.average;
      return point;
    }).filter(() => yearsKeys.length);
  }, [years]);

  const yearKeys = years?.school?.map((s) => s.academicYear) || [];
  const palette = ["#1b2437", "#c45c26", "#3d6b4f", "#7a5c3a"];

  if (!years && !teachers) return <p>Loading comparisons…</p>;

  return (
    <div>
      <PageHeader
        title="Comparisons"
        subtitle="Previous years for the same exam type, and marks in the same subject across teachers"
        actions={
          <ExamSelect
            exams={years?.exams || teachers?.exams || []}
            value={examId}
            onChange={onExam}
          />
        }
      />

      <div className="flex gap-2 mb-4">
        <button className={tab === "years" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("years")}>
          Previous years
        </button>
        <button className={tab === "teachers" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("teachers")}>
          Same subject, other teachers
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <select className="field w-auto" value={className} onChange={(e) => onClass(e.target.value)}>
          <option value="">All classes</option>
          {(years?.classes || teachers?.classes || []).map((c) => (
            <option key={c} value={c}>Class {c}</option>
          ))}
        </select>
        <select className="field w-auto" value={subjectName} onChange={(e) => onSubject(e.target.value)}>
          <option value="">All subjects</option>
          {(years?.subjects || teachers?.subjects || []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {tab === "years" && years && (
        <div className="space-y-4">
          {years.empty ? (
            <EmptyNote>No exam data yet.</EmptyNote>
          ) : (
            <>
              <YearComparison series={years.school} title="School — same exam type across years" />
              <Panel title="Class-wise across years">
                {classChart.length ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={classChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
                      <XAxis dataKey="label" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      {yearKeys.map((year, i) => (
                        <Bar key={year} dataKey={year} name={year} fill={palette[i % palette.length]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyNote>Need more than one academic year to chart classes.</EmptyNote>
                )}
              </Panel>
              <div className="grid lg:grid-cols-2 gap-4">
                <Panel title="Division-wise">
                  {(years.byDivision || []).map((row) => (
                    <YearMini key={row.id} label={row.label} years={row.years} to={`/classes/${row.id}`} />
                  ))}
                </Panel>
                <Panel title="Subject-wise">
                  {(years.bySubject || []).map((row) => (
                    <YearMini
                      key={row.name}
                      label={row.name}
                      years={row.years}
                      to={`/analysis/subjects/name/${encodeURIComponent(row.name)}`}
                    />
                  ))}
                </Panel>
              </div>
              <Panel title="Teacher-wise">
                {(years.byTeacher || []).map((row) => (
                  <YearMini
                    key={row.teacherId}
                    label={row.teacher}
                    years={row.years}
                    to={`/analysis/teachers/${row.teacherId}`}
                  />
                ))}
              </Panel>
            </>
          )}
        </div>
      )}

      {tab === "teachers" && teachers && (
        <div className="space-y-4">
          {teachers.empty ? (
            <EmptyNote>No exam data yet.</EmptyNote>
          ) : !teachers.comparisons?.length ? (
            <EmptyNote>
              No subject currently has two or more teachers with marks for this exam
              {className ? ` in Class ${className}` : ""}
              {subjectName ? ` in ${subjectName}` : ""}.
            </EmptyNote>
          ) : (
            teachers.comparisons.map((block) => (
              <Panel
                key={block.name}
                title={block.name}
                action={
                  <Link className="text-xs underline text-ink-700/60" to={`/analysis/subjects/name/${encodeURIComponent(block.name)}`}>
                    Full subject view
                  </Link>
                }
              >
                {block.leader && block.trailer && (
                  <p className="text-sm text-ink-700/70 mb-3">
                    {block.leader.teacher} leads at {block.leader.average}%. {block.trailer.teacher} is {block.spread} points behind.
                  </p>
                )}
                <TeacherCompareTable rows={block.teachers} />
              </Panel>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function YearMini({ label, years, to }) {
  const latest = years?.at(-1);
  const prev = years?.at(-2);
  const diff =
    latest?.average != null && prev?.average != null
      ? Math.round((latest.average - prev.average) * 10) / 10
      : null;
  const inner = (
    <div className="flex items-baseline justify-between py-2 border-t border-ink-900/10 first:border-0 text-sm">
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-ink-700/70">
        {latest?.average ?? "—"}%
        {diff != null && (
          <span className={`ml-2 ${diff > 0 ? "text-moss-600" : diff < 0 ? "text-clay-600" : ""}`}>
            {diff > 0 ? "+" : ""}{diff}
          </span>
        )}
      </span>
    </div>
  );
  return to ? <Link to={to} className="block hover:bg-white/50 -mx-1 px-1 rounded">{inner}</Link> : inner;
}
