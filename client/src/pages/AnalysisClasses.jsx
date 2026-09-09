import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { ExamSelect } from "../components/AnalysisPanels.jsx";
import { BarTrack, EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
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
  const [params, setParams] = useSearchParams();
  const selectedClassName = params.get("className") || "";

  async function load(id) {
    const res = await api(`/api/analytics/classes-overview${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, []);

  function selectClass(className) {
    const next = new URLSearchParams(params);
    if (className) next.set("className", className);
    else next.delete("className");
    setParams(next, { replace: true });
  }

  if (!data) return <p>Loading classes…</p>;
  if (data.empty) return <p>No exam data yet.</p>;

  const classWise = data.classWise || [];
  const selectedClass = classWise.find((c) => c.className === selectedClassName) || null;
  const divisions = selectedClass
    ? (selectedClass.divisions || (data.divisionWise || []).filter((d) => d.className === selectedClassName))
    : [];

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.analysisClasses}
        subtitle="Open a whole class, or pick a class then a division, for subject stats and rankings"
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

      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <h2 className="font-serif text-xl">Division-wise</h2>
        {selectedClass && (
          <button type="button" className="btn-ghost" onClick={() => selectClass("")}>
            Change class
          </button>
        )}
      </div>

      {!selectedClass ? (
        <>
          <p className="text-sm text-ink-700/60 mb-3">Select a class to see its divisions.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classWise.map((c) => (
              <button
                key={c.className}
                type="button"
                onClick={() => selectClass(c.className)}
                className="card p-4 text-left hover:border-clay-500"
              >
                <div className="font-serif text-2xl">{c.label}</div>
                <div className="text-sm text-ink-700/60 mt-1">
                  {c.sectionCount} division{c.sectionCount === 1 ? "" : "s"} · {c.studentCount} students
                </div>
              </button>
            ))}
            {!classWise.length && <EmptyNote>No classes in your view.</EmptyNote>}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-700/60 mb-3">
            {selectedClass.label} · {selectedClass.sectionCount} division
            {selectedClass.sectionCount === 1 ? "" : "s"}
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {divisions.map((division) => (
              <DivisionCard key={division.id} division={division} />
            ))}
            {!divisions.length && <EmptyNote>No divisions in this class.</EmptyNote>}
          </div>
        </>
      )}
    </div>
  );
}
