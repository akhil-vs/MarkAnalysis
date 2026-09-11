import { useEffect, useMemo, useRef, useState } from "react";
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
];

const FALLBACK_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

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

function EntryCell({ entries, onEdit, editingId }) {
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  if (!list.length) {
    return <div className="min-h-[3.25rem] rounded-lg bg-ink-900/[0.03]" />;
  }

  const subjectNames = [...new Set(list.map((e) => e.subject?.name).filter(Boolean))];
  const sharedSubject = subjectNames.length === 1 ? subjectNames[0] : null;
  const multi = list.length > 1;

  return (
    <div className="min-h-[3.25rem] rounded-lg border border-ink-900/10 bg-white px-2 py-1.5">
      {sharedSubject && (
        <div className="text-sm font-medium leading-snug">{sharedSubject}</div>
      )}
      <div
        className={`${sharedSubject ? "mt-0.5" : ""} ${multi ? "grid gap-x-2 gap-y-1" : ""}`}
        style={
          multi
            ? { gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }
            : undefined
        }
      >
        {list.map((entry) => {
          const body = (
            <>
              {!sharedSubject && (
                <div className="text-sm font-medium leading-snug truncate">{entry.subject?.name}</div>
              )}
              <div className="text-xs text-ink-700/65 truncate">
                {entry.classSection?.label}
                {entry.room ? ` · ${entry.room}` : ""}
              </div>
            </>
          );
          if (!onEdit) {
            return (
              <div key={entry.id} className="min-w-0">
                {body}
              </div>
            );
          }
          const active = editingId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onEdit(entry)}
              className={`min-w-0 w-full rounded-md px-1 py-0.5 text-left transition hover:bg-ink-900/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500/50 ${
                active ? "bg-clay-500/10 ring-1 ring-clay-500/40" : ""
              }`}
              title="Click to edit"
            >
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TeacherTimetable() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const leadership = isLeadership(user.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = ["daily", "weekly"].includes(searchParams.get("view"))
    ? searchParams.get("view")
    : "weekly";
  const date = searchParams.get("date") || todayYmd();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const formRef = useRef(null);
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

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({
      classSectionId: entry.classSection?.id || "",
      subjectId: entry.subject?.id || "",
      periodId: entry.period?.id || "",
      dayOfWeek: String(entry.dayOfWeek || "1"),
      room: entry.room || "",
    });
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function cancelEdit() {
    setEditingId(null);
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
          const working =
            Array.isArray(res.workingDays) && res.workingDays.length
              ? res.workingDays
              : FALLBACK_WORKING_DAYS;
          setForm((f) =>
            f.classSectionId
              ? f
              : {
                  ...f,
                  classSectionId: first.classSectionId,
                  subjectId: first.subjectId,
                  periodId: (res.periods || []).find((p) => !p.isBreak)?.id || "",
                  dayOfWeek: String(working[0] || 1),
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
      const key = `${e.dayOfWeek}|${e.period?.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    const days =
      Array.isArray(data.workingDays) && data.workingDays.length
        ? data.workingDays
        : FALLBACK_WORKING_DAYS;
    return { map, days };
  }, [data, view]);

  async function saveEntry(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        classSectionId: form.classSectionId,
        subjectId: form.subjectId,
        periodId: form.periodId,
        dayOfWeek: Number(form.dayOfWeek),
        room: form.room || null,
      };
      if (editingId) {
        await api(`/api/timetable/entries/${editingId}`, { method: "PATCH", body });
        toast.success("Period updated.");
        setEditingId(null);
      } else {
        await api("/api/timetable/entries", {
          method: "POST",
          body: { teacherId: id, ...body },
        });
        toast.success("Period added to timetable.");
      }
      await reload();
    } catch (err) {
      toast.error(err.message || (editingId ? "Could not update period" : "Could not add period"));
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entryId) {
    setBusy(true);
    try {
      await api(`/api/timetable/entries/${entryId}`, { method: "DELETE" });
      toast.success("Period removed.");
      if (editingId === entryId) setEditingId(null);
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
        subtitle="Teaching timetable · daily or weekly"
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
      </div>

      {view === "daily" && (
        <DailyView
          data={data}
          leadership={leadership}
          busy={busy}
          editingId={editingId}
          onEdit={startEdit}
          onRemove={removeEntry}
        />
      )}
      {view === "weekly" && weeklyGrid && (
        <WeeklyView
          data={data}
          grid={weeklyGrid}
          teachingPeriods={teachingPeriods}
          onEdit={leadership ? startEdit : undefined}
          editingId={editingId}
        />
      )}

      {leadership && (
        <form ref={formRef} className="card mt-5 p-4 space-y-3" onSubmit={saveEntry}>
          <h3 className="font-serif text-lg">{editingId ? "Edit period" : "Add period"}</h3>
          {editingId && (
            <p className="text-sm text-ink-700/65">
              Change day, period, class, subject, or room, then save. Or cancel to add a new period instead.
            </p>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <label className="block">
              <span className="label">Day</span>
              <select
                className="field"
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
                disabled={busy}
              >
                {(data.workingDays?.length ? data.workingDays : FALLBACK_WORKING_DAYS).map((d) => (
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
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy || !assignmentOptions.length}>
              <BusyLabel
                busy={busy}
                idle={editingId ? "Save changes" : "Add to timetable"}
                busyText="Saving…"
              />
            </button>
            {editingId && (
              <button type="button" className="btn-ghost" onClick={cancelEdit} disabled={busy}>
                Cancel
              </button>
            )}
          </div>
          {!assignmentOptions.length && (
            <p className="text-sm text-ink-700/60">Assign subjects on Staff before adding timetable periods.</p>
          )}
        </form>
      )}
    </div>
  );
}

function DailyView({ data, leadership, busy, editingId, onEdit, onRemove }) {
  const entries = [...(data.entries || [])].sort(
    (a, b) => (a.period?.sortOrder ?? 0) - (b.period?.sortOrder ?? 0)
  );
  if (!entries.length) {
    return <EmptyNote>No teaching periods on {data.dayName || "this day"}.</EmptyNote>;
  }
  return (
    <div className="card overflow-x-auto">
      {leadership && (
        <p className="px-4 pt-3 text-sm text-ink-700/65">
          Click a row to edit it below.
        </p>
      )}
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
            <tr
              key={e.id}
              className={`${editingId === e.id ? "bg-clay-500/5" : ""} ${
                onEdit ? "cursor-pointer hover:bg-ink-900/[0.03]" : ""
              }`}
              onClick={onEdit ? () => onEdit(e) : undefined}
            >
              <td>{e.period?.name}</td>
              <td className="whitespace-nowrap text-ink-700/70">
                {e.period?.startTime}–{e.period?.endTime}
              </td>
              <td>{e.subject?.name}</td>
              <td>{e.classSection?.label}</td>
              <td>{e.room || "—"}</td>
              {leadership && (
                <td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="btn-ghost text-clay-600"
                    disabled={busy}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onRemove(e.id);
                    }}
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

function WeeklyView({ data, grid, teachingPeriods, onEdit, editingId }) {
  if (!teachingPeriods.length) {
    return <EmptyNote>No school periods defined yet.</EmptyNote>;
  }
  return (
    <div className="card overflow-x-auto p-2 sm:p-3">
      {onEdit && (
        <p className="mb-2 px-2 text-sm text-ink-700/65">
          Click a class in the grid to edit it below.
        </p>
      )}
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
                    <EntryCell
                      entries={grid.map.get(`${day}|${period.id}`)}
                      onEdit={onEdit}
                      editingId={editingId}
                    />
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
