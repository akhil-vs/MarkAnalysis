import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { ExamSelect } from "../components/AnalysisPanels.jsx";
import { BarTrack, EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";

export default function AnalysisSubjects() {
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(id) {
    const res = await api(`/api/analytics/subjects-overview${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, []);

  if (!data) return <p>Loading subjects…</p>;
  if (data.empty) return <p>No exam data yet.</p>;

  return (
    <div>
      <PageHeader
        title="Subject analysis"
        subtitle="School-wide results for each subject, then drill into a class paper"
        actions={<ExamSelect exams={data.exams} value={examId} onChange={load} />}
      />
      <div className="space-y-4">
        {(data.subjects || []).map((s) => (
          <div key={s.name} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link className="font-serif text-2xl hover:underline" to={`/analysis/subjects/name/${encodeURIComponent(s.name)}`}>
                  {s.name}
                </Link>
                <div className="text-sm text-ink-700/60 mt-1">
                  {s.teacherCount} teacher{s.teacherCount === 1 ? "" : "s"} · classes {s.classNames.join(", ")}
                  {s.teacherCount >= 2 ? " · comparable across teachers" : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-serif text-3xl">{s.average ?? "—"}%</div>
                <div className="text-xs text-ink-700/55">{s.passRate ?? "—"}% pass</div>
              </div>
            </div>
            <div className="mt-3"><BarTrack value={s.average} /></div>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {s.records.map((r) => (
                <Link key={r.id} to={`/analysis/subjects/${r.id}`} className="rounded-lg border border-ink-900/10 px-3 py-2 text-sm hover:border-clay-500">
                  <div className="font-medium">Class {r.className}</div>
                  <div className="text-ink-700/60">{r.average ?? "—"}% avg · {r.passRate ?? "—"}% pass</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
        {!data.subjects?.length && <EmptyNote>No subjects yet.</EmptyNote>}
      </div>
    </div>
  );
}
