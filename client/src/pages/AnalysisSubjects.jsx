import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";

export default function AnalysisSubjects() {
  const [subjects, setSubjects] = useState([]);

  useEffect(() => {
    api("/api/subjects").then(setSubjects);
  }, []);

  return (
    <div>
      <PageHeader title="Subject analysis" subtitle="Compare classes and teachers for each subject" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subjects.map((s) => (
          <Link key={s.id} to={`/analysis/subjects/${s.id}`} className="card p-4 hover:border-clay-500">
            <div className="font-serif text-2xl">{s.name}</div>
            <div className="text-sm text-ink-700/60 mt-1">Class {s.className} · max {s.maxMarks}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
