import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { isLeadership } from "../lib/roles.js";

const VIEWS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6];

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

function shiftMonth(ymd, delta) {
  const [y, m] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}-01`;
}

function EntryCell({ entry }) {
  if (!entry) {
    return <div className="min-h-[3.25rem] rounded-lg bg-ink-900/[0.03]" />;
  }
  return (
    <div className="min-h-[3.25rem] rounded-lg border border-ink-900/10 bg-white px-2 py-1.5">
      <div className="text-sm font-medium leading-snug">{entry.subject?.name}</div>
      <div className="text-xs text-ink-700/65">{entry.classSection?.label}</div>
      {entry.room && <div className="text-[10px] text-ink-700/45">{entry.room}</div>}
    </div>
  );
}

export default function TeacherTimetable() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const leadership = isLeadership(user.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = ["daily", "weekly", "monthly"].includes(searchParams.get("view"))
    ? searchParams.get("view")
    : "weekly";
  const date = searchParams.get("date") || todayYmd();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    classSectionId: "",
    subjectId: "",
    periodId: "",
    dayOfWeek: "1",
    room: "",
  });

  function setView(next) {
    const params = new URLSearchParams(searchParams);
    params.set("view", next);
    if (!params.get("date")) params.set("date", date);
    setSearchParams(params);
  }

  function setDate(next) {
    const params = new URLSearchParams(searchParams);
    params.set("date", next);
    params.set("view", view);
    setSearchParams(params);
  }

  useEffect(() => {
    let cancelled = false;
    setError("");
    api(`/api/timetable/teachers/${id}?view=${view}&date=${date}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        if (res.teacher?.assignments?.length) {
          const first = res.teacher.assignments[0];
          setForm((f) =>
            f.classSectionId
              ? f
              : {
                  ...f,
                  classSectionId: first.classSectionId,
                  subjectId: first.subjectId,
                  periodId: (res.periods || []).find((p) => !p.isBreak)?.id || "",
                }
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load timetable");
        setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, view, date]);

  async function reload() {
    const res = await api(`/api/timetable/teachers/${id}?view=${view}&date=${date}`);
    setData(res);
    return res;
  }

  const teachingPeriods = useMemo(
    () => (data?.periods || []).filter((p) => !p.isBreak),
    [data]
  );

  const assignmentOptions = data?.teacher?.assignments || [];
  const subjectsForClass = useMemo(() => {
    return assignmentOptions.filter((a) => a.classSectionId === form.classSectionId);
  }, [assignmentOptions, form.classSectionId]);

  const weeklyGrid = useMemo(() => {
    if (!data || view !== "weekly") return null;
    const map = new Map();
    for (const e of data.entries || []) {
      map.set(`${e.dayOfWeek}|${e.period?.id}`, e);
    }
    return { map, days: WEEKDAY_ORDER };
  }, [data, view]);

  async function addEntry(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/timetable/entries", {
        method: "POST",
        body: {
          teacherId: id,
          classSectionId: form.classSectionId,
          subjectId: form.subjectId,
          periodId: form.periodId,
          dayOfWeek: Number(form.dayOfWeek),
          room: form.room || null,
        },
      });
      toast.success("Period added to timetable.");
      await reload();
    } catch (err) {
      toast.error(err.message || "Could not add period");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entryId) {
    setBusy(true);
    try {
      await api(`/api/timetable/entries/${entryId}`, { method: "DELETE" });
      toast.success("Period removed.");
      await reload();
    } catch (err) {
      toast.error(err.message || "Could not remove period");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Teacher timetable" subtitle={error} />
        <Link to="/timetables" className="btn-ghost">Back to timetables</Link>
      </div>
    );
  }

  if (!data) return <p>Loading timetable…</p>;

  const title = data.teacher?.name || "Teacher";

  return (
    <div>
      <PageHeader
        title={title}
        subtitle="Teaching timetable · choose daily, weekly, or monthly"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/timetables" className="btn-ghost">All teachers</Link>
            <Link to={`/timetables?mode=daily&date=${date}`} className="btn-ghost">Daily board</Link>
            <Link to={`/timetables?mode=free&date=${date}`} className="btn-ghost">Find free</Link>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={view === v.id ? "btn-primary" : "btn-ghost"}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === "daily" && (
          <>
            <button type="button" className="btn-ghost" onClick={() => setDate(shiftDate(date, -1))}>Previous day</button>
            <input
              type="date"
              className="field-filter"
              value={date}
              onChange={(e) => setDate(e.target.value || todayYmd())}
            />
            <button type="button" className="btn-ghost" onClick={() => setDate(shiftDate(date, 1))}>Next day</button>
            <span className="text-sm text-ink-700/65">{data.dayName}</span>
          </>
        )}
        {view === "weekly" && (
          <span className="text-sm text-ink-700/65">
            Weekly template · {(data.entries || []).length} teaching periods
          </span>
        )}
        {view === "monthly" && (
          <>
            <button type="button" className="btn-ghost" onClick={() => setDate(shiftMonth(date, -1))}>Previous month</button>
            <input
              type="month"
              className="field-filter"
              value={data.month || date.slice(0, 7)}
              onChange={(e) => setDate(`${e.target.value || date.slice(0, 7)}-01`)}
            />
            <button type="button" className="btn-ghost" onClick={() => setDate(shiftMonth(date, 1))}>Next month</button>
            <span className="text-sm text-ink-700/65">
              {data.summary?.teachingDays ?? 0} teaching days · {data.summary?.totalSlots ?? 0} periods
            </span>
          </>
        )}
      </div>

      {view === "daily" && <DailyView data={data} leadership={leadership} busy={busy} onRemove={removeEntry} />}
      {view === "weekly" && weeklyGrid && (
        <WeeklyView data={data} grid={weeklyGrid} teachingPeriods={teachingPeriods} />
      )}
      {view === "monthly" && <MonthlyView data={data} onPickDay={(d) => { setDate(d); setView("daily"); }} />}

      {leadership && (
        <form className="card mt-5 p-4 space-y-3" onSubmit={addEntry}>
          <h3 className="font-serif text-lg">Add period</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="block">
              <span className="label">Day</span>
              <select
                className="field"
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
                disabled={busy}
              >
                {WEEKDAY_ORDER.map((d) => (
                  <option key={d} value={d}>{data.dayNames?.[d] || d}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Period</span>
              <select
                className="field"
                value={form.periodId}
                onChange={(e) => setForm({ ...form, periodId: e.target.value })}
                required
                disabled={busy}
              >
                <option value="">Select period</option>
                {teachingPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.startTime}–{p.endTime})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Class</span>
              <select
                className="field"
                value={form.classSectionId}
                onChange={(e) => {
                  const classSectionId = e.target.value;
                  const next = assignmentOptions.find((a) => a.classSectionId === classSectionId);
                  setForm({
                    ...form,
                    classSectionId,
                    subjectId: next?.subjectId || "",
                  });
                }}
                required
                disabled={busy}
              >
                <option value="">Select class</option>
                {[...new Map(assignmentOptions.map((a) => [a.classSectionId, a])).values()].map((a) => (
                  <option key={a.classSectionId} value={a.classSectionId}>
                    {a.classSection.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Subject</span>
              <select
                className="field"
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                required
                disabled={busy}
              >
                <option value="">Select subject</option>
                {subjectsForClass.map((a) => (
                  <option key={a.subjectId} value={a.subjectId}>{a.subject.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Room</span>
              <input
                className="field"
                value={form.room}
                onChange={(e) => setForm({ ...form, room: e.target.value })}
                placeholder="Optional"
                disabled={busy}
              />
            </label>
          </div>
          <button className="btn-primary" disabled={busy || !assignmentOptions.length}>
            <BusyLabel busy={busy} idle="Add to timetable" busyText="Saving…" />
          </button>
          {!assignmentOptions.length && (
            <p className="text-sm text-ink-700/60">Assign subjects on Staff before adding timetable periods.</p>
          )}
        </form>
      )}
    </div>
  );
}

function DailyView({ data, leadership, busy, onRemove }) {
  const entries = [...(data.entries || [])].sort(
    (a, b) => (a.period?.sortOrder ?? 0) - (b.period?.sortOrder ?? 0)
  );
  if (!entries.length) {
    return <EmptyNote>No teaching periods on {data.dayName || "this day"}.</EmptyNote>;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Time</th>
            <th>Subject</th>
            <th>Class</th>
            <th>Room</th>
            {leadership && <th />}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{e.period?.name}</td>
              <td className="whitespace-nowrap text-ink-700/70">
                {e.period?.startTime}–{e.period?.endTime}
              </td>
              <td>{e.subject?.name}</td>
              <td>{e.classSection?.label}</td>
              <td>{e.room || "—"}</td>
              {leadership && (
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-ghost text-clay-600"
                    disabled={busy}
                    onClick={() => onRemove(e.id)}
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeeklyView({ data, grid, teachingPeriods }) {
  if (!teachingPeriods.length) {
    return <EmptyNote>No school periods defined yet.</EmptyNote>;
  }
  return (
    <div className="card overflow-x-auto p-2 sm:p-3">
      <table className="w-full text-sm border-separate border-spacing-1 min-w-[52rem]">
        <thead>
          <tr>
            <th className="text-left font-medium text-ink-700/70 px-2 py-1 w-28">Period</th>
            {grid.days.map((d) => (
              <th key={d} className="text-left font-medium text-ink-700/70 px-2 py-1">
                {data.dayNames?.[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data.periods || []).map((period) => (
            <tr key={period.id}>
              <td className="align-top px-2 py-1">
                <div className="font-medium">{period.name}</div>
                <div className="text-[11px] text-ink-700/50">
                  {period.startTime}–{period.endTime}
                </div>
              </td>
              {grid.days.map((day) => (
                <td key={`${day}-${period.id}`} className="align-top">
                  {period.isBreak ? (
                    <div className="min-h-[3.25rem] rounded-lg bg-moss-500/10 px-2 py-2 text-xs text-moss-600">
                      {period.name}
                    </div>
                  ) : (
                    <EntryCell entry={grid.map.get(`${day}|${period.id}`)} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyView({ data, onPickDay }) {
  const days = data.days || [];
  if (!days.length) return <EmptyNote>No days in this month.</EmptyNote>;

  const firstWeekday = days[0].dayOfWeek;
  const leading = firstWeekday === 7 ? 6 : firstWeekday - 1;
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...days,
  ];

  return (
    <div className="card p-3 sm:p-4">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-[11px] uppercase tracking-wide text-ink-700/55">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {cells.map((day, idx) => {
          if (!day) return <div key={`pad-${idx}`} />;
          const hasWork = day.entryCount > 0;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onPickDay(day.date)}
              className={`min-h-[4.5rem] rounded-xl border px-2 py-2 text-left transition ${
                hasWork
                  ? "border-clay-500/30 bg-clay-500/5 hover:border-clay-500"
                  : "border-ink-900/10 bg-white/70 hover:border-ink-900/25"
              }`}
            >
              <div className="text-sm font-medium">{Number(day.date.slice(-2))}</div>
              <div className={`mt-1 text-[11px] ${hasWork ? "text-clay-600" : "text-ink-700/40"}`}>
                {hasWork ? `${day.entryCount} period${day.entryCount === 1 ? "" : "s"}` : "—"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
