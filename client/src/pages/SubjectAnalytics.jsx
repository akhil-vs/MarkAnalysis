import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";
import { ExamSelect, TeacherCompareTable, YearComparison, comparableNote } from "../components/AnalysisPanels.jsx";
import { PageHeader } from "../components/Layout.jsx";

export default function SubjectAnalytics() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(eid) {
    const res = await api(`/api/analytics/subject/${id}${eid ? `?examId=${eid}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, [id]);

  if (!data) return <p>Loading subject…</p>;
  if (data.empty) return <p>No data for this subject yet.</p>;

  return (
    <div>
      <PageHeader
        title={data.subject.name}
        subtitle={`Class ${data.subject.className} · ${data.exam.name} · ${data.exam.academicYear || ""}`}
        actions={
          <ExamSelect exams={data.exams} value={examId} onChange={load} />
        }
      />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-serif text-lg mb-3">Average by section</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.classAvgs}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="average" fill="#1b2437" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-4 overflow-x-auto">
          <h3 className="font-serif text-lg mb-3">Teachers of this subject</h3>
          {comparableNote(data.teacherMeta?.comparable, data.subject.name)}
          <TeacherCompareTable rows={data.teacherCompare} />
          {data.teacherMeta?.spread != null && data.teacherMeta?.comparable && (
            <p className="text-xs text-ink-700/60 mt-3">
              Spread between teachers is {data.teacherMeta.spread} points.
            </p>
          )}
        </div>
      </div>
      {data.schoolSubject && (
        <p className="text-sm text-ink-700/60 mt-4">
          School-wide {data.schoolSubject.name} average is {data.schoolSubject.average ?? "—"}%.{" "}
          <Link className="underline" to={`/analysis/subjects/name/${encodeURIComponent(data.subject.name)}`}>Open full school view</Link>
        </p>
      )}
      <div className="mt-4">
        <YearComparison series={data.yearComparison} title="This subject versus previous years" />
      </div>
    </div>
  );
}
