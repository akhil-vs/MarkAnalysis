import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function teacherSearchText(t) {
  return searchHaystack(
    t.name,
    t.email,
    t.schoolId,
    t.entryCount,
    (t.assignments || []).map((a) => [a.classSection?.label, a.subject?.name])
  );
}

export default function Timetables() {
  const [teachers, setTeachers] = useState(null);
  const [error, setError] = useState("");
  const table = useTableSearch(teachers || [], { getSearchText: teacherSearchText });

  useEffect(() => {
    api("/api/timetable/teachers")
      .then(setTeachers)
      .catch((err) => setError(err.message || "Could not load teachers"));
  }, []);

  const totalSlots = useMemo(
    () => (teachers || []).reduce((sum, t) => sum + (t.entryCount || 0), 0),
    [teachers]
  );

  if (error) return <p className="text-clay-600">{error}</p>;
  if (!teachers) return <p>Loading teacher timetables…</p>;

  return (
    <div>
      <PageHeader
        title="Teacher timetables"
        subtitle="Daily, weekly, and monthly schedules for every active teacher"
        actions={
          <div className="text-sm text-ink-700/70">
            {teachers.length} teachers · {totalSlots} weekly slots
          </div>
        }
      />

      <div className="mb-3">
        <TableToolbar q={table.q} setQ={table.setQ} placeholder="Search teachers…" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {table.filtered.map((t) => {
          const subjects = [...new Set((t.assignments || []).map((a) => a.subject?.name).filter(Boolean))];
          const classes = [...new Set((t.assignments || []).map((a) => a.classSection?.label).filter(Boolean))];
          return (
            <Link
              key={t.id}
              to={`/timetables/teachers/${t.id}`}
              className="card p-4 hover:border-clay-500 transition-colors"
            >
              <div className="font-serif text-2xl leading-tight">{t.name}</div>
              <div className="mt-1 text-sm text-ink-700/60">
                {subjects.slice(0, 3).join(" · ") || "No subjects"}
                {subjects.length > 3 ? ` +${subjects.length - 3}` : ""}
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div className="text-xs text-ink-700/55">
                  {classes.length ? classes.slice(0, 4).join(", ") : "No classes"}
                  {classes.length > 4 ? ` +${classes.length - 4}` : ""}
                </div>
                <div className="shrink-0 rounded-lg bg-ink-900/5 px-2 py-1 text-xs font-medium">
                  {t.entryCount} periods/week
                </div>
              </div>
            </Link>
          );
        })}
        {!table.filtered.length && <EmptyNote>No teachers match your search.</EmptyNote>}
      </div>
    </div>
  );
}
