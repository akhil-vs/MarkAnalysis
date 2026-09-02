import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ExamSelect } from "../components/AnalysisPanels.jsx";
import { BarTrack, EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";

export default function AnalysisTeachers() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(id) {
    const res = await api(`/api/analytics/staff${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, []);

  if (!data) return <p>Loading teachers…</p>;
  if (data.empty) return <p>No exam data yet.</p>;

  const rows = [...(data.teachers || [])].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  return (
    <div>
      <PageHeader
        title="Teacher analysis"
        subtitle={`How each teacher’s registers look in ${data.exam.name}`}
        actions={<ExamSelect exams={data.exams} value={examId} onChange={load} />}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((t) => (
          <Link key={t.teacherId} to={`/analysis/teachers/${t.teacherId}`} className="card p-4 hover:border-clay-500">
            <div className="font-serif text-2xl">{t.name}</div>
            <div className="text-sm text-ink-700/60 mt-1">{t.subjects.join(" · ") || "No assignments"}</div>
            <div className="mt-3 flex justify-between text-sm">
              <span>{t.average ?? "—"}% avg</span>
              <span>{t.passRate ?? "—"}% pass</span>
            </div>
            <div className="mt-2"><BarTrack value={t.average} /></div>
          </Link>
        ))}
        {!rows.length && <EmptyNote>No active teachers.</EmptyNote>}
      </div>
      {user.role === "TEACHER" ? null : (
        <p className="text-xs text-ink-700/50 mt-4">
          Open a teacher to see year-on-year change and same-subject comparison with colleagues.
        </p>
      )}
    </div>
  );
}
