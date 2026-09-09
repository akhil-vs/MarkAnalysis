import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

const MODES = [
  { id: "teachers", label: "Teachers" },
  { id: "daily", label: "Daily board" },
  { id: "free", label: "Find free" },
];

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDate(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function teacherSearchText(t) {
  return searchHaystack(
    t.name,
    t.email,
    t.schoolId,
    t.entryCount,
    (t.assignments || []).map((a) => [a.classSection?.label, a.subject?.name])
  );
}

function freeTeacherSearchText(t) {
  return searchHaystack(t.name, t.email, t.schoolId);
}

function ModeTabs({ mode, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={mode === m.id ? "btn-primary" : "btn-ghost"}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function DateNav({ date, dayName, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost" onClick={() => onChange(shiftDate(date, -1))}>
        Previous day
      </button>
      <input
        type="date"
        className="field-filter"
        value={date}
        onChange={(e) => onChange(e.target.value || todayYmd())}
      />
      <button type="button" className="btn-ghost" onClick={() => onChange(shiftDate(date, 1))}>
        Next day
      </button>
      <button type="button" className="btn-ghost" onClick={() => onChange(todayYmd())}>
        Today
      </button>
      {dayName && <span className="text-sm text-ink-700/65">{dayName}</span>}
    </div>
  );
}

function SlotCell({ entry }) {
  if (!entry) {
    return (
      <div className="min-h-[3.25rem] rounded-lg bg-moss-500/10 px-2 py-1.5 text-[11px] text-moss-600">
        Free
      </div>
    );
  }
  return (
    <div className="min-h-[3.25rem] rounded-lg border border-ink-900/10 bg-white px-2 py-1.5">
      <div className="text-sm font-medium leading-snug">{entry.subject?.name}</div>
      <div className="text-xs text-ink-700/65">{entry.classSection?.label}</div>
      {entry.room && <div className="text-[10px] text-ink-700/45">{entry.room}</div>}
    </div>
  );
}

export default function Timetables() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = MODES.some((m) => m.id === searchParams.get("mode"))
    ? searchParams.get("mode")
    : "teachers";
  const date = searchParams.get("date") || todayYmd();
  const periodId = searchParams.get("periodId") || "";

  function setMode(next) {
    const params = new URLSearchParams(searchParams);
    params.set("mode", next);
    if (!params.get("date")) params.set("date", date);
    setSearchParams(params);
  }

  function setDate(next) {
    const params = new URLSearchParams(searchParams);
    params.set("date", next);
    params.set("mode", mode);
    setSearchParams(params);
  }

  function setPeriodId(next) {
    const params = new URLSearchParams(searchParams);
    params.set("mode", "free");
    params.set("date", date);
    if (next) params.set("periodId", next);
    else params.delete("periodId");
    setSearchParams(params);
  }

  return (
    <div>
      <PageHeader
        title="Teacher timetables"
        subtitle="Browse every teacher, the full daily board, or who is free for a period"
        actions={<ModeTabs mode={mode} onChange={setMode} />}
      />

      {mode === "teachers" && <TeachersList />}
      {mode === "daily" && <DailyBoard date={date} onDateChange={setDate} />}
      {mode === "free" && (
        <FreeFinder date={date} periodId={periodId} onDateChange={setDate} onPeriodChange={setPeriodId} />
      )}
    </div>
  );
}

function TeachersList() {
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

  if (error) {
    return (
      <div>
        <p className="text-sm text-clay-600 mb-2">{error}</p>
        <p className="text-sm text-ink-700/65">
          Try refreshing after the latest deployment finishes applying database updates.
        </p>
      </div>
    );
  }
  if (!teachers) return <p>Loading teacher timetables…</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <TableToolbar q={table.q} setQ={table.setQ} placeholder="Search teachers…" />
        <div className="text-sm text-ink-700/70">
          {teachers.length} teachers · {totalSlots} weekly slots
        </div>
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

function DailyBoard({ date, onDateChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    setData(null);
    api(`/api/timetable/day?date=${encodeURIComponent(date)}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Could not load daily board");
          setData(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const teachingPeriods = useMemo(
    () => (data?.periods || []).filter((p) => !p.isBreak),
    [data]
  );

  const filteredTeachers = useMemo(() => {
    const list = data?.teachers || [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((t) => searchHaystack(t.name, t.email, t.schoolId).includes(needle));
  }, [data, q]);

  if (error) return <p className="text-sm text-clay-600">{error}</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <DateNav date={date} dayName={data?.dayName} onChange={onDateChange} />
        <TableToolbar q={q} setQ={setQ} placeholder="Filter teachers…" />
      </div>

      {!data && <p>Loading daily board…</p>}

      {data && !teachingPeriods.length && <EmptyNote>No school periods defined yet.</EmptyNote>}

      {data && teachingPeriods.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink-700/65">
            {filteredTeachers.length} teachers · green cells are free that period
          </p>
          <div className="card overflow-x-auto p-2 sm:p-3">
            <table className="w-full text-sm border-separate border-spacing-1 min-w-[48rem]">
              <thead>
                <tr>
                  <th className="text-left font-medium text-ink-700/70 px-2 py-1 sticky left-0 bg-white z-10 min-w-[9rem]">
                    Teacher
                  </th>
                  {(data.periods || []).map((period) => (
                    <th key={period.id} className="text-left font-medium text-ink-700/70 px-2 py-1 min-w-[7.5rem]">
                      <div>{period.name}</div>
                      <div className="text-[11px] font-normal text-ink-700/50">
                        {period.startTime}–{period.endTime}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTeachers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td className="align-top px-2 py-1 sticky left-0 bg-white z-10">
                      <Link
                        to={`/timetables/teachers/${teacher.id}?view=daily&date=${date}`}
                        className="font-medium hover:text-clay-600"
                      >
                        {teacher.name}
                      </Link>
                      <div className="text-[11px] text-ink-700/50">
                        {teacher.taughtCount} period{teacher.taughtCount === 1 ? "" : "s"}
                      </div>
                    </td>
                    {(data.periods || []).map((period) => (
                      <td key={`${teacher.id}-${period.id}`} className="align-top">
                        {period.isBreak ? (
                          <div className="min-h-[3.25rem] rounded-lg bg-ink-900/[0.04] px-2 py-2 text-xs text-ink-700/45">
                            {period.name}
                          </div>
                        ) : (
                          <SlotCell entry={teacher.entriesByPeriodId?.[period.id]} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredTeachers.length && (
              <div className="p-4">
                <EmptyNote>No teachers match your filter.</EmptyNote>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FreeFinder({ date, periodId, onDateChange, onPeriodChange }) {
  const [periods, setPeriods] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const freeTable = useTableSearch(result?.free || [], { getSearchText: freeTeacherSearchText });

  const teachingPeriods = useMemo(
    () => (periods || []).filter((p) => !p.isBreak),
    [periods]
  );

  useEffect(() => {
    let cancelled = false;
    api("/api/timetable/periods")
      .then((res) => {
        if (cancelled) return;
        setPeriods(res);
        if (!periodId) {
          const first = (res || []).find((p) => !p.isBreak);
          if (first) onPeriodChange(first.id);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load periods");
      });
    return () => {
      cancelled = true;
    };
    // Only seed period once periods load; avoid looping on onPeriodChange identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!periodId) {
      setResult(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    api(`/api/timetable/free?date=${encodeURIComponent(date)}&periodId=${encodeURIComponent(periodId)}`)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Could not find free teachers");
          setResult(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, periodId]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <DateNav date={date} dayName={result?.dayName} onChange={onDateChange} />
        <label className="block min-w-[12rem]">
          <span className="label">Period</span>
          <select
            className="field"
            value={periodId}
            onChange={(e) => onPeriodChange(e.target.value)}
            disabled={!teachingPeriods.length}
          >
            <option value="">Select period</option>
            {teachingPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.startTime}–{p.endTime})
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-clay-600 mb-3">{error}</p>}
      {loading && <p>Finding free teachers…</p>}

      {result && !loading && (
        <div className="space-y-5">
          <p className="text-sm text-ink-700/65">
            {result.dayName}
            {result.period ? ` · ${result.period.name} (${result.period.startTime}–${result.period.endTime})` : ""}
            {" · "}
            <span className="font-medium text-moss-600">{result.summary.freeCount} free</span>
            {" · "}
            <span className="text-ink-700/80">{result.summary.busyCount} teaching</span>
          </p>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-serif text-xl">Free teachers</h3>
              <TableToolbar q={freeTable.q} setQ={freeTable.setQ} placeholder="Search free teachers…" />
            </div>
            {!freeTable.filtered.length ? (
              <EmptyNote>
                {result.free.length ? "No free teachers match your search." : "No teachers are free this period."}
              </EmptyNote>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {freeTable.filtered.map((t) => (
                  <Link
                    key={t.id}
                    to={`/timetables/teachers/${t.id}?view=daily&date=${date}`}
                    className="card p-4 hover:border-moss-500 transition-colors"
                  >
                    <div className="font-serif text-2xl leading-tight">{t.name}</div>
                    <div className="mt-2 text-xs font-medium text-moss-600">Available this period</div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="font-serif text-xl mb-2">Teaching this period</h3>
            {!result.busy.length ? (
              <EmptyNote>Everyone is free — no one is scheduled.</EmptyNote>
            ) : (
              <div className="card overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Subject</th>
                      <th>Class</th>
                      <th>Room</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.busy.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <Link
                            to={`/timetables/teachers/${t.id}?view=daily&date=${date}`}
                            className="hover:text-clay-600"
                          >
                            {t.name}
                          </Link>
                        </td>
                        <td>{t.entry?.subject?.name || "—"}</td>
                        <td>{t.entry?.classSection?.label || "—"}</td>
                        <td>{t.entry?.room || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
