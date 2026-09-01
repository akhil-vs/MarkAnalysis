import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { ExamSelect } from "../components/AnalysisPanels.jsx";
import { BarTrack, EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";

export default function AnalysisClasses() {
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(id) {
    const res = await api(`/api/analytics/classes-overview${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, []);

  if (!data) return <p>Loading classes…</p>;
  if (data.empty) return <p>No exam data yet.</p>;

  return (
    <div>
      <PageHeader
        title="Class & division analysis"
        subtitle="Open a whole class, or a single division, for subject stats and rankings"
        actions={<ExamSelect exams={data.exams} value={examId} onChange={load} />}
      />

      <h2 className="font-serif text-xl mb-3">Class-wise</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {(data.classWise || []).map((c) => (
          <Link key={c.className} to={`/analysis/classes/group/${encodeURIComponent(c.className)}`} className="card p-4 hover:border-clay-500">
            <div className="font-serif text-2xl">{c.label}</div>
            <div className="text-sm text-ink-700/60 mt-1">
              {c.sectionCount} division{c.sectionCount === 1 ? "" : "s"} · {c.studentCount} students
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span>{c.average ?? "—"}% avg</span>
              <span>{c.passRate ?? "—"}% pass</span>
            </div>
            <div className="mt-2"><BarTrack value={c.average} /></div>
          </Link>
        ))}
        {!data.classWise?.length && <EmptyNote>No classes in your view.</EmptyNote>}
      </div>

      <h2 className="font-serif text-xl mb-3">Division-wise</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(data.divisionWise || []).map((c) => (
          <Link key={c.id} to={`/classes/${c.id}`} className="card p-4 hover:border-clay-500">
            <div className="font-serif text-2xl">{c.label}</div>
            <div className="text-sm text-ink-700/60 mt-1">
              {c.studentCount} students{c.teacher ? ` · ${c.teacher}` : ""}
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span>{c.average ?? "—"}% avg</span>
              <span>{c.passRate ?? "—"}% pass</span>
            </div>
            <div className="mt-2"><BarTrack value={c.average} color="#3d6b4f" /></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
