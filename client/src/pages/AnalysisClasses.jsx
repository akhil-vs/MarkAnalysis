import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";

export default function AnalysisClasses() {
  const { assignments } = useAuth();
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    api("/api/classes").then(setClasses);
  }, []);

  const allowed = new Set(assignments.map((a) => a.classSectionId));
  const rows = allowed.size ? classes.filter((c) => allowed.has(c.id)) : classes;

  return (
    <div>
      <PageHeader title="Class analysis" subtitle="Open a section for subject stats, grades, and rankings" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {rows.map((c) => (
          <Link key={c.id} to={`/classes/${c.id}`} className="card p-4 hover:border-clay-500">
            <div className="font-serif text-2xl">{c.className}-{c.section}</div>
            <div className="text-sm text-ink-700/60 mt-1">
              {c._count?.students ?? 0} students
              {c.classTeacher?.name ? ` · ${c.classTeacher.name}` : ""}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
