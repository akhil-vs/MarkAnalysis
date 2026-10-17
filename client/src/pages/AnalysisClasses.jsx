import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { ExamSelect } from "../components/ExamSelect.jsx";
import { BarTrack, EmptyNote } from "../components/DashboardKit.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { LoadingState } from "../components/Spinner.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";
import { NAV_TITLES, paths } from "../lib/nav.js";

function DivisionCard({ division }) {
  return (
    <Link to={paths.classSection(division.id)} className="card p-4 hover:border-clay-500">
      <div className="font-serif text-2xl">{division.label}</div>
      <div className="text-sm text-ink-700/60 mt-1">
        {division.studentCount} students{division.teacher ? ` · ${division.teacher}` : ""}
      </div>
      <div className="mt-3 flex justify-between text-sm">
        <span>{division.average ?? "—"}% avg</span>
        <span>{division.passRate ?? "—"}% pass</span>
      </div>
      <div className="mt-2"><BarTrack value={division.average} color="#3d6b4f" /></div>
    </Link>
  );
}

export default function AnalysisClasses() {
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");
  const [error, setError] = useState("");

  async function load(id) {
    setError("");
    try {
      const res = await api(`/api/analytics/classes-overview${id ? `?examId=${id}` : ""}`);
      setData(res);
      if (res.exam) setExamId(res.exam.id);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not load classes"));
    }
  }

  useEffect(() => {
    load("");
  }, []);

  if (error) return <LoadError message={error} />;
  if (!data) return <LoadingState label="Loading classes…" />;
  if (data.empty) return <p>No exam data yet.</p>;

  const classWise = data.classWise || [];
  const divisions = data.divisionWise || [];

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.analysisClasses}
        subtitle="Open a whole class or a division for subject stats and rankings"
        actions={<ExamSelect exams={data.exams} value={examId} onChange={load} />}
      />

      <h2 className="font-serif text-xl mb-3">Class-wise</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {classWise.map((c) => (
          <Link key={c.className} to={paths.classGroup(c.className)} className="card p-4 hover:border-clay-500">
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
        {!classWise.length && <EmptyNote>No classes in your view.</EmptyNote>}
      </div>

      <h2 className="font-serif text-xl mb-3">Division-wise</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {divisions.map((division) => (
          <DivisionCard key={division.id} division={division} />
        ))}
        {!divisions.length && <EmptyNote>No divisions in your view.</EmptyNote>}
      </div>
    </div>
  );
}
