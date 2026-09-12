import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { ExamSelect } from "../components/ExamSelect.jsx";
import { BarTrack, EmptyNote } from "../components/DashboardKit.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { NAV_TITLES, paths } from "../lib/nav.js";

export default function AnalysisTeachers() {
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");
  const [error, setError] = useState("");

  async function load(id) {
    setError("");
    try {
      const res = await api(`/api/analytics/staff${id ? `?examId=${id}` : ""}`);
      setData(res);
      if (res.exam) setExamId(res.exam.id);
    } catch (err) {
      setError(err.message || "Could not load teachers");
    }
  }

  useEffect(() => {
    load("");
  }, []);

  if (error) return <LoadError message={error} />;
  if (!data) return <p>Loading teachers…</p>;
  if (data.empty) return <p>No exam data yet.</p>;

  const rows = [...(data.teachers || [])].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.analysisTeachers}
        subtitle={`How each teacher’s registers look in ${data.exam.name}`}
        actions={<ExamSelect exams={data.exams} value={examId} onChange={load} />}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((t) => (
          <Link key={t.teacherId} to={paths.teacher(t.teacherId)} className="card p-4 hover:border-clay-500">
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
      <p className="text-xs text-ink-700/50 mt-4">
        Open a teacher to see year-on-year change and same-subject comparison with colleagues.
      </p>
    </div>
  );
}
