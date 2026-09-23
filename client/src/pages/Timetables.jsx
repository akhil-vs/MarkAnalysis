import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { BusyLabel, InlineLoading, LoadingState } from "../components/Spinner.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { useToast } from "../components/Toast.jsx";
import { avatarTone, initials } from "../lib/classRecordPresentation.js";
import { hasFeature } from "../lib/features.js";
import { NAV_TITLES } from "../lib/nav.js";
import { schoolWeekRangeContaining } from "../lib/schoolWeek.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

const ALL_MODES = [
  { id: "teachers", label: "Teachers", needs: ["timetables", "leaveApproval", "assignSubstitutes"] },
  { id: "daily", label: "Daily board", needs: ["timetables", "leaveApproval", "assignSubstitutes"] },
  { id: "free", label: "Find free", needs: ["timetables", "assignSubstitutes"] },
  { id: "leave", label: "Leave & cover", needs: ["leaveApproval", "assignSubstitutes", "timetables"] },
];

function modesForFeatures(features) {
  return ALL_MODES.filter((m) => m.needs.some((id) => hasFeature(features, id)));
}

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

/** Format teaching minutes as compact hours for the daily board (e.g. 2h 15m). */
function formatTaughtHours(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return "0h";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function ModeTabs({ mode, onChange, modes }) {
  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((m) => (
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

function SlotCell({ entries, onAssignCover }) {
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  if (!list.length) {
    return (
      <div className="min-h-[3.25rem] rounded-lg bg-moss-500/10 px-2 py-1.5 text-[11px] text-moss-600">
        Free
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {list.map((entry) => {
        const uncovered = entry.isUncovered;
        const cover = entry.isCover;
        const onLeave = entry.onLeave && !cover;
        let shell =
          "min-h-[3.25rem] rounded-lg border px-2 py-1.5";
        if (uncovered) shell += " border-clay-500/40 bg-clay-500/10";
        else if (cover) shell += " border-sky-600/30 bg-sky-500/10";
        else if (onLeave && entry.coveredBy) shell += " border-ink-900/10 bg-ink-900/[0.04] opacity-70";
        else shell += " border-ink-900/10 bg-white";

        return (
          <div key={entry.id} className={shell}>
            {(uncovered || cover || entry.coveredBy) && (
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700/55">
                {uncovered ? "Needs cover" : cover ? "Cover" : "On leave · covered"}
              </div>
            )}
            <div className="text-sm font-medium leading-snug truncate">{entry.subject?.name}</div>
            <div className="text-xs text-ink-700/65 truncate">
              {entry.classSection?.label}
              {entry.room ? ` · ${entry.room}` : ""}
            </div>
            {cover && entry.originalTeacher && (
              <div className="mt-0.5 text-[11px] text-ink-700/55 truncate">
                for {entry.originalTeacher.name}
              </div>
            )}
            {entry.coveredBy && (
              <div className="mt-0.5 text-[11px] text-ink-700/55 truncate">
                → {entry.coveredBy.name}
              </div>
            )}
            {uncovered && onAssignCover && (
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-clay-600 hover:underline"
                onClick={() => onAssignCover(entry)}
              >
                Assign cover
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Timetables() {
  const { features } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const modes = useMemo(() => modesForFeatures(features), [features]);
  const canApproveLeave = hasFeature(features, "leaveApproval");
  const canAssignSubs = hasFeature(features, "assignSubstitutes");

  const rawMode = searchParams.get("mode");
  if (rawMode === "periods") {
    return <Navigate to="/school#school-schedule" replace />;
  }
  const mode = modes.some((m) => m.id === rawMode) ? rawMode : modes[0]?.id || "teachers";
  const date = searchParams.get("date") || todayYmd();
  const periodId = searchParams.get("periodId") || "";
  const leaveTeacherId = searchParams.get("leaveTeacher") || "";

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

  function openLeaveForTeacher(teacherId) {
    const params = new URLSearchParams(searchParams);
    params.set("mode", "leave");
    params.set("date", date);
    if (teacherId) params.set("leaveTeacher", teacherId);
    else params.delete("leaveTeacher");
    setSearchParams(params);
  }

  if (!modes.length) {
    return (
      <div>
        <PageHeader title={NAV_TITLES.timetables} subtitle="No timetable features enabled for your role." />
        <EmptyNote>Ask the principal to enable Timetables, Leave approval, or Assign substitutes under Staff → Role access.</EmptyNote>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.timetables}
        subtitle="Expand a teacher to open their timetable, put them on leave, or review hrs history. Daily board, free periods, and leave cover stay on the other tabs. Edit the school week and bell schedule under School profile."
        actions={<ModeTabs mode={mode} modes={modes} onChange={setMode} />}
      />

      {mode === "teachers" && (
        <TeachersList
          onPutOnLeave={canApproveLeave ? openLeaveForTeacher : null}
          canAssignSubs={canAssignSubs}
        />
      )}
      {mode === "daily" && (
        <DailyBoard
          date={date}
          onDateChange={setDate}
          onPutOnLeave={canApproveLeave ? openLeaveForTeacher : null}
          canAssignCover={canAssignSubs}
        />
      )}
      {mode === "free" && (
        <FreeFinder date={date} periodId={periodId} onDateChange={setDate} onPeriodChange={setPeriodId} />
      )}
      {mode === "leave" && (
        <LeaveCoverPanel
          date={date}
          onDateChange={setDate}
          initialTeacherId={leaveTeacherId}
          canApproveLeave={canApproveLeave}
          canAssignSubs={canAssignSubs}
        />
      )}
    </div>
  );
}

function AccordionChevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      className={`shrink-0 text-ink-700/45 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function actionButtonClass(active) {
  return active ? "btn-primary text-xs" : "btn-ghost text-xs";
}

function TeachersList({ onPutOnLeave, canAssignSubs }) {
  const [teachers, setTeachers] = useState(null);
  const [error, setError] = useState("");
  const [openTeacherId, setOpenTeacherId] = useState(null);
  const [openAction, setOpenAction] = useState("");
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

  function toggleTeacher(id) {
    setOpenTeacherId((current) => (current === id ? null : id));
    setOpenAction("");
  }

  function toggleAction(action) {
    setOpenAction((current) => (current === action ? "" : action));
  }

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
  if (!teachers) return <LoadingState label="Loading teacher timetables…" />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <TableToolbar q={table.q} setQ={table.setQ} placeholder="Search teachers…" />
        <div className="text-sm text-ink-700/70">
          {teachers.length} teachers · {totalSlots} weekly slots
        </div>
      </div>

      <div className="card">
        <div className="accordion-list" role="list">
          {table.filtered.map((t) => {
            const subjects = [...new Set((t.assignments || []).map((a) => a.subject?.name).filter(Boolean))];
            const classes = [...new Set((t.assignments || []).map((a) => a.classSection?.label).filter(Boolean))];
            const open = openTeacherId === t.id;
            const panelId = `timetable-teacher-panel-${t.id}`;
            const buttonId = `timetable-teacher-trigger-${t.id}`;
            return (
              <div key={t.id} className={`accordion-item ${open ? "accordion-item-open" : ""}`} role="listitem">
                <h3 className="m-0">
                  <button
                    type="button"
                    id={buttonId}
                    className="accordion-trigger"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggleTeacher(t.id)}
                  >
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(t.id || t.name)}`}
                      aria-hidden="true"
                    >
                      {initials(t.name)}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="font-medium text-ink-900">{t.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-700/55">
                        {subjects.slice(0, 3).join(" · ") || "No subjects"}
                        {subjects.length > 3 ? ` +${subjects.length - 3}` : ""}
                      </span>
                    </span>
                    <span className="hidden sm:flex shrink-0 rounded-lg bg-ink-900/5 px-2 py-1 text-xs font-medium">
                      {t.entryCount} periods/week
                    </span>
                    <AccordionChevron open={open} />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!open}
                  className="accordion-panel px-3 sm:px-4 pb-4 pt-1"
                >
                  <div className="space-y-3 rounded-lg border border-ink-900/10 bg-white/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45 mb-1">
                          Classes
                        </div>
                        <p className="text-sm text-ink-700/75">
                          {classes.length ? classes.join(", ") : "No classes"}
                        </p>
                      </div>
                      <div className="sm:hidden rounded-lg bg-ink-900/5 px-2 py-1 text-xs font-medium">
                        {t.entryCount} periods/week
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45 mb-1.5">
                        Actions
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={actionButtonClass(openAction === "timetable")}
                          aria-expanded={openAction === "timetable"}
                          onClick={() => toggleAction("timetable")}
                        >
                          Open timetable
                        </button>
                        {onPutOnLeave && (
                          <button
                            type="button"
                            className={actionButtonClass(openAction === "leave")}
                            aria-expanded={openAction === "leave"}
                            onClick={() => toggleAction("leave")}
                          >
                            Put on leave
                          </button>
                        )}
                        <button
                          type="button"
                          className={actionButtonClass(openAction === "hours")}
                          aria-expanded={openAction === "hours"}
                          onClick={() => toggleAction("hours")}
                        >
                          Hrs history
                        </button>
                      </div>
                    </div>

                    {open && openAction === "timetable" && <TeacherAccordionTimetable teacherId={t.id} />}
                    {open && openAction === "leave" && onPutOnLeave && (
                      <TeacherAccordionLeave
                        teacher={t}
                        canAssignSubs={canAssignSubs}
                        onReviewCovers={onPutOnLeave}
                      />
                    )}
                    {open && openAction === "hours" && <TeacherAccordionHours teacherId={t.id} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!table.filtered.length && (
          <div className="p-4">
            <EmptyNote>No teachers match your search.</EmptyNote>
          </div>
        )}
      </div>
    </div>
  );
}

function CompactEntryCell({ entries }) {
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  if (!list.length) {
    return <div className="min-h-[2.5rem] rounded-lg bg-ink-900/[0.03]" />;
  }
  return (
    <div className="min-h-[2.5rem] space-y-1 rounded-lg border border-ink-900/10 bg-white px-2 py-1">
      {list.map((entry) => (
        <div key={entry.id} className="min-w-0">
          <div className="text-sm font-medium leading-snug truncate">{entry.subject?.name}</div>
          <div className="text-[11px] text-ink-700/65 truncate">
            {entry.classSection?.label}
            {entry.room ? ` · ${entry.room}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeacherAccordionTimetable({ teacherId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    setData(null);
    api(`/api/timetable/teachers/${teacherId}?view=weekly&date=${todayYmd()}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load timetable");
      });
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  const grid = useMemo(() => {
    if (!data) return null;
    const map = new Map();
    for (const entry of data.entries || []) {
      const key = `${entry.dayOfWeek}|${entry.period?.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    const days =
      Array.isArray(data.workingDays) && data.workingDays.length ? data.workingDays : [1, 2, 3, 4, 5, 6];
    return { map, days };
  }, [data]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45">Weekly timetable</div>
        <Link to={`/timetables/teachers/${teacherId}`} className="text-xs font-medium text-clay-600 hover:underline">
          Open full page
        </Link>
      </div>
      {error && <p className="text-sm text-clay-600">{error}</p>}
      {!data && !error && <InlineLoading label="Loading timetable…" />}
      {data && grid && (
        <div className="overflow-x-auto">
          {(data.entries || []).length === 0 ? (
            <EmptyNote>No weekly periods yet. Open the full page to add slots.</EmptyNote>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-1 min-w-[40rem]">
              <thead>
                <tr>
                  <th className="text-left font-medium text-ink-700/70 px-2 py-1 w-24">Period</th>
                  {grid.days.map((day) => (
                    <th key={day} className="text-left font-medium text-ink-700/70 px-2 py-1">
                      {data.dayNames?.[day]}
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
                          <div className="min-h-[2.5rem] rounded-lg bg-moss-500/10 px-2 py-1.5 text-xs text-moss-600">
                            {period.name}
                          </div>
                        ) : (
                          <CompactEntryCell entries={grid.map.get(`${day}|${period.id}`)} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function TeacherAccordionLeave({ teacher, canAssignSubs, onReviewCovers }) {
  const toast = useToast();
  const [form, setForm] = useState({
    startDate: todayYmd(),
    endDate: todayYmd(),
    reason: "",
    suggestCovers: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await api("/api/timetable/leaves", {
        method: "POST",
        body: {
          teacherId: teacher.id,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason || undefined,
          suggestCovers: Boolean(form.suggestCovers && canAssignSubs),
        },
      });
      toast.success("Leave recorded — timetables updated");
      setSaved(res);
    } catch (err) {
      setError(err.message || "Could not record leave");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45">Put on leave</div>
      <p className="text-sm text-ink-700/65">
        Approved leave overlays {teacher.name}&apos;s timetable for these dates.
      </p>
      {error && <p className="text-sm text-clay-600">{error}</p>}
      {saved?.leave && (
        <p className="text-sm text-moss-600">
          Leave saved
          {saved.leave.startDate === saved.leave.endDate
            ? ` for ${saved.leave.startDate}`
            : ` from ${saved.leave.startDate} to ${saved.leave.endDate}`}
          .
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Start</span>
          <input
            type="date"
            className="field"
            required
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="label">End</span>
          <input
            type="date"
            className="field"
            required
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          />
        </label>
      </div>
      <label className="block">
        <span className="label">Reason (optional)</span>
        <input
          className="field"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="Sick leave, training, …"
        />
      </label>
      {canAssignSubs && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.suggestCovers}
            onChange={(e) => setForm({ ...form, suggestCovers: e.target.checked })}
          />
          Suggest a different free teacher for each vacated period
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          <BusyLabel busy={saving} idle="Save leave" busyText="Saving…" />
        </button>
        {saved && onReviewCovers && (
          <button type="button" className="btn-ghost" onClick={() => onReviewCovers(teacher.id)}>
            Review covers
          </button>
        )}
      </div>
    </form>
  );
}

function TeacherAccordionHours({ teacherId }) {
  const [weekAnchor, setWeekAnchor] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    setData(null);
    const query = weekAnchor ? `?week=${encodeURIComponent(weekAnchor)}` : "";
    api(`/api/timetable/teachers/${teacherId}/hours${query}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load hours history");
      });
    return () => {
      cancelled = true;
    };
  }, [teacherId, weekAnchor]);

  const from = data?.from;
  const to = data?.to;
  const isCurrentWeek = data
    ? from === schoolWeekRangeContaining(todayYmd(), data.workingDays).from
    : !weekAnchor;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45">Hrs history</div>
        <Link
          to={`/timetables/teachers/${teacherId}?view=history${from ? `&date=${from}` : ""}`}
          className="text-xs font-medium text-clay-600 hover:underline"
        >
          Open full page
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={!from}
          onClick={() => from && setWeekAnchor(shiftDate(from, -7))}
        >
          Previous week
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={!from}
          onClick={() => from && setWeekAnchor(shiftDate(from, 7))}
        >
          Next week
        </button>
        {!isCurrentWeek && (
          <button type="button" className="btn-ghost text-xs" onClick={() => setWeekAnchor("")}>
            This week
          </button>
        )}
      </div>
      {error && <p className="text-sm text-clay-600">{error}</p>}
      {!data && !error && <InlineLoading label="Loading hours history…" />}
      {data && (
        <>
          <p className="text-sm text-ink-700/65">
            {from} → {to}
            {isCurrentWeek ? " · this week" : ""}
            {" · "}
            {formatTaughtHours(data.summary?.taughtMinutes)} own
            {" · "}
            <span className="font-medium text-sky-700">
              +{formatTaughtHours(data.summary?.extraMinutes)} extra
            </span>
            {data.summary?.leaveDays > 0 ? ` · ${data.summary.leaveDays} leave day${data.summary.leaveDays === 1 ? "" : "s"}` : ""}
          </p>
          {!(data.days || []).length ? (
            <EmptyNote>No working days in this week.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Own</th>
                    <th>Extra</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.days || []).map((day) => (
                    <tr key={day.date}>
                      <td>
                        {day.date}
                        <div className="text-[11px] text-ink-700/50">
                          {day.dayName}
                          {day.onLeave ? <span className="text-clay-600"> · Leave</span> : ""}
                        </div>
                      </td>
                      <td>
                        {day.taughtCount} · {formatTaughtHours(day.taughtMinutes)}
                      </td>
                      <td className={day.extraCount ? "font-medium text-sky-700" : ""}>
                        {day.extraCount} · {formatTaughtHours(day.extraMinutes)}
                      </td>
                      <td>
                        {day.totalCount} · {formatTaughtHours(day.totalMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssignCoverModal({ slot, date, onClose, onSaved }) {
  const toast = useToast();
  const [candidates, setCandidates] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slot) return undefined;
    let cancelled = false;
    const params = new URLSearchParams({
      date,
      periodId: slot.period?.id || slot.periodId,
      classSectionId: slot.classSection?.id || slot.classSectionId,
      subjectId: slot.subject?.id || slot.subjectId,
      originalTeacherId: slot.teacher?.id || slot.originalTeacherId,
    });
    api(`/api/timetable/substitutes/suggest?${params}`)
      .then((res) => {
        if (cancelled) return;
        setCandidates(res.candidates || []);
        setSelectedId(res.candidates?.[0]?.id || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not rank substitutes");
      });
    return () => {
      cancelled = true;
    };
  }, [slot, date]);

  async function save() {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    try {
      await api("/api/timetable/substitutes", {
        method: "POST",
        body: {
          date,
          periodId: slot.period?.id || slot.periodId,
          classSectionId: slot.classSection?.id || slot.classSectionId,
          subjectId: slot.subject?.id || slot.subjectId,
          originalTeacherId: slot.teacher?.id || slot.originalTeacherId,
          substituteTeacherId: selectedId,
          sourceTimetableEntryId: slot.id?.startsWith?.("cover:") ? undefined : slot.id,
          leaveId: slot.leave?.id,
        },
      });
      toast.success("Cover assigned");
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || "Could not assign cover");
    } finally {
      setSaving(false);
    }
  }

  if (!slot) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-900/40 p-3">
      <div className="card w-full max-w-lg p-4 sm:p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl leading-tight">Assign cover</h3>
            <p className="mt-1 text-sm text-ink-700/65">
              {slot.subject?.name} · {slot.classSection?.label} · {date}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-clay-600">{error}</p>}
        {!candidates && !error && <InlineLoading label="Ranking free teachers…" className="mt-4" />}

        {candidates && (
          <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
            {!candidates.length && <EmptyNote>No eligible substitutes for this period.</EmptyNote>}
            {candidates.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                  selectedId === c.id ? "border-clay-500 bg-clay-500/5" : "border-ink-900/10"
                }`}
              >
                <input
                  type="radio"
                  className="mt-1"
                  name="substitute"
                  checked={selectedId === c.id}
                  onChange={() => setSelectedId(c.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-ink-700/60">
                    Score {c.score?.toFixed?.(1) ?? c.score}
                    {c.freeRemaining != null ? ` · ${c.freeRemaining} free left` : ""}
                  </div>
                  {c.reasons?.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-ink-700/50 truncate">
                      {c.reasons.slice(0, 3).join(" · ")}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedId || saving}
            onClick={save}
          >
            <BusyLabel busy={saving} idle="Save cover" busyText="Saving…" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DailyBoard({ date, onDateChange, onPutOnLeave, canAssignCover }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [assignSlot, setAssignSlot] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [date, reloadKey]);

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

      {data?.summary && (
        <p className="mb-3 text-sm text-ink-700/65">
          {data.summary.onLeaveCount} on leave
          {" · "}
          <span className="text-clay-600">{data.summary.uncoveredCount} need cover</span>
          {" · "}
          {data.summary.coverCount} covers assigned
        </p>
      )}

      {!data && <InlineLoading label="Loading daily board…" className="p-2" />}

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
                  <th className="text-left font-medium text-ink-700/70 px-2 py-1 sticky left-0 bg-cream z-10 min-w-[9rem]">
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
                    <td className="align-top px-2 py-1 sticky left-0 bg-cream z-10">
                      <Link
                        to={`/timetables/teachers/${teacher.id}?view=daily&date=${date}`}
                        className="font-medium hover:text-clay-600"
                      >
                        {teacher.name}
                      </Link>
                      <div className="text-[11px] text-ink-700/50">
                        {teacher.onLeave && <span className="text-clay-600 font-medium">Leave · </span>}
                        {teacher.taughtCount} period{teacher.taughtCount === 1 ? "" : "s"}
                        {" · "}
                        {formatTaughtHours(teacher.taughtMinutes)}
                        {(teacher.extraCount > 0 || teacher.extraMinutes > 0) && (
                          <span className="ml-1.5 font-medium text-sky-700">
                            {" "}
                            +{teacher.extraCount} extra · {formatTaughtHours(teacher.extraMinutes)}
                          </span>
                        )}
                      </div>
                      {!teacher.onLeave && onPutOnLeave && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] text-ink-700/55 hover:text-clay-600"
                          onClick={() => onPutOnLeave(teacher.id)}
                        >
                          Put on leave
                        </button>
                      )}
                    </td>
                    {(data.periods || []).map((period) => (
                      <td key={`${teacher.id}-${period.id}`} className="align-top">
                        {period.isBreak ? (
                          <div className="min-h-[3.25rem] rounded-lg bg-ink-900/[0.04] px-2 py-2 text-xs text-ink-700/45">
                            {period.name}
                          </div>
                        ) : (
                          <SlotCell
                            entries={teacher.entriesByPeriodId?.[period.id]}
                            onAssignCover={canAssignCover ? (entry) => setAssignSlot(entry) : null}
                          />
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

      {assignSlot && (
        <AssignCoverModal
          slot={assignSlot}
          date={date}
          onClose={() => setAssignSlot(null)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
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
      {loading && <InlineLoading label="Finding free teachers…" />}

      {result && !loading && (
        <div className="space-y-5">
          <p className="text-sm text-ink-700/65">
            {result.dayName}
            {result.period ? ` · ${result.period.name} (${result.period.startTime}–${result.period.endTime})` : ""}
            {" · "}
            <span className="font-medium text-moss-600">{result.summary.freeCount} free</span>
            {" · "}
            <span className="text-ink-700/80">{result.summary.busyCount} teaching</span>
            {result.summary.onLeaveCount > 0 && (
              <>
                {" · "}
                <span className="text-clay-600">{result.summary.onLeaveCount} on leave</span>
              </>
            )}
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

          {result.onLeave?.length > 0 && (
            <section>
              <h3 className="font-serif text-xl mb-2">On leave</h3>
              <div className="flex flex-wrap gap-2">
                {result.onLeave.map((t) => (
                  <span key={t.id} className="rounded-lg bg-clay-500/10 px-3 py-1.5 text-sm text-clay-600">
                    {t.name}
                  </span>
                ))}
              </div>
            </section>
          )}

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
                    {result.busy.flatMap((t) => {
                      const entries = t.entries?.length ? t.entries : t.entry ? [t.entry] : [];
                      const coverRows = (t.covers || []).map((c) => (
                        <tr key={`cover-${c.id}`}>
                          <td>
                            <Link
                              to={`/timetables/teachers/${t.id}?view=daily&date=${date}`}
                              className="hover:text-clay-600"
                            >
                              {t.name}
                            </Link>
                            <div className="text-[11px] text-sky-700">Cover</div>
                          </td>
                          <td>{c.subject?.name || "—"}</td>
                          <td>{c.classSection?.label || "—"}</td>
                          <td>—</td>
                        </tr>
                      ));
                      const teachingRows = entries.map((entry) => (
                        <tr key={entry.id || `${t.id}-${entry.subject?.id}-${entry.classSection?.id}`}>
                          <td>
                            <Link
                              to={`/timetables/teachers/${t.id}?view=daily&date=${date}`}
                              className="hover:text-clay-600"
                            >
                              {t.name}
                            </Link>
                          </td>
                          <td>{entry.subject?.name || "—"}</td>
                          <td>{entry.classSection?.label || "—"}</td>
                          <td>{entry.room || "—"}</td>
                        </tr>
                      ));
                      return [...coverRows, ...teachingRows];
                    })}
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

function LeaveCoverPanel({ date, onDateChange, initialTeacherId, canApproveLeave, canAssignSubs }) {
  const toast = useToast();
  const [teachers, setTeachers] = useState([]);
  const [leaves, setLeaves] = useState(null);
  const [pending, setPending] = useState(null);
  const [form, setForm] = useState({
    teacherId: initialTeacherId || "",
    startDate: date,
    endDate: date,
    reason: "",
    suggestCovers: true,
  });
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const [selectedSubs, setSelectedSubs] = useState({});
  const [accepting, setAccepting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      teacherId: initialTeacherId || f.teacherId,
      startDate: date,
      endDate: f.endDate || date,
    }));
  }, [initialTeacherId, date]);

  useEffect(() => {
    if (!canApproveLeave && !canAssignSubs) return undefined;
    api("/api/timetable/teachers")
      .then(setTeachers)
      .catch(() => setTeachers([]));
  }, [canApproveLeave, canAssignSubs]);

  useEffect(() => {
    let cancelled = false;
    const from = shiftDate(date, -7);
    const to = shiftDate(date, 21);
    Promise.all([
      api(`/api/timetable/leaves?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=ACTIVE`),
      canApproveLeave
        ? api(
            `/api/timetable/leaves?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=PENDING`
          )
        : Promise.resolve([]),
    ])
      .then(([activeRows, pendingRows]) => {
        if (cancelled) return;
        setLeaves(activeRows);
        setPending(pendingRows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Could not load leaves");
          setLeaves([]);
          setPending([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey, canApproveLeave]);

  async function submitLeave(e) {
    e.preventDefault();
    if (!canApproveLeave) return;
    setSaving(true);
    setError("");
    try {
      const res = await api("/api/timetable/leaves", {
        method: "POST",
        body: {
          teacherId: form.teacherId,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason || undefined,
          suggestCovers: form.suggestCovers && canAssignSubs,
        },
      });
      toast.success("Leave recorded — timetables updated");
      setPlan(res.plan || null);
      if (res.plan?.suggestions?.length) {
        const defaults = {};
        for (const s of res.plan.suggestions) {
          const key = `${s.date}:${s.periodId}:${s.classSectionId}`;
          defaults[key] = s.suggestedSubstitute?.id || "";
        }
        setSelectedSubs(defaults);
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Could not record leave");
    } finally {
      setSaving(false);
    }
  }

  async function reviewLeave(leaveId, status) {
    setReviewingId(leaveId);
    setError("");
    try {
      const res = await api(`/api/timetable/leaves/${leaveId}`, {
        method: "PATCH",
        body: { status, suggestCovers: status === "ACTIVE" && canAssignSubs },
      });
      toast.success(status === "ACTIVE" ? "Leave approved — shown on timetables" : "Leave request rejected");
      if (res?.plan) {
        setPlan(res.plan);
        const defaults = {};
        for (const s of res.plan.suggestions || []) {
          const key = `${s.date}:${s.periodId}:${s.classSectionId}`;
          defaults[key] = s.suggestedSubstitute?.id || "";
        }
        setSelectedSubs(defaults);
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Could not update leave");
    } finally {
      setReviewingId("");
    }
  }

  async function cancelLeave(leaveId) {
    try {
      await api(`/api/timetable/leaves/${leaveId}`, { method: "DELETE" });
      toast.success("Leave cancelled");
      if (plan?.leave?.id === leaveId) setPlan(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err.message || "Could not cancel leave");
    }
  }

  async function loadPlan(leaveId) {
    if (!canAssignSubs) return;
    setError("");
    try {
      const res = await api(`/api/timetable/leaves/${leaveId}/plan`);
      setPlan(res);
      const defaults = {};
      for (const s of res.suggestions || []) {
        const key = `${s.date}:${s.periodId}:${s.classSectionId}`;
        defaults[key] = s.suggestedSubstitute?.id || "";
      }
      setSelectedSubs(defaults);
    } catch (err) {
      setError(err.message || "Could not build cover plan");
    }
  }

  async function acceptSuggestions() {
    if (!plan?.suggestions?.length || !canAssignSubs) return;
    const substitutions = plan.suggestions
      .map((s) => {
        const key = `${s.date}:${s.periodId}:${s.classSectionId}`;
        const substituteTeacherId = selectedSubs[key];
        if (!substituteTeacherId) return null;
        return {
          date: s.date,
          periodId: s.periodId,
          classSectionId: s.classSectionId,
          subjectId: s.subjectId,
          originalTeacherId: s.originalTeacherId,
          substituteTeacherId,
          sourceTimetableEntryId: s.sourceTimetableEntryId,
          leaveId: s.leaveId,
        };
      })
      .filter(Boolean);

    if (!substitutions.length) {
      setError("Select at least one substitute");
      return;
    }

    setAccepting(true);
    setError("");
    try {
      await api("/api/timetable/substitutes", {
        method: "POST",
        body: { substitutions },
      });
      toast.success(`Assigned ${substitutions.length} cover${substitutions.length === 1 ? "" : "s"}`);
      setPlan(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Could not save covers");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="space-y-6">
      <DateNav date={date} onChange={onDateChange} />

      {canApproveLeave && pending && pending.length > 0 && (
        <div className="card p-4 sm:p-5">
          <h3 className="font-serif text-2xl mb-1">Pending leave requests</h3>
          <p className="text-sm text-ink-700/65 mb-3">
            Approve to overlay leave on timetables, or reject the request.
          </p>
          {error && <p className="text-sm text-clay-600 mb-2">{error}</p>}
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Dates</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((leave) => (
                  <tr key={leave.id}>
                    <td>{leave.teacher?.name || "—"}</td>
                    <td>
                      {leave.startDate}
                      {leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ""}
                    </td>
                    <td>{leave.reason || "—"}</td>
                    <td className="text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="btn-primary text-xs mr-2"
                        disabled={reviewingId === leave.id}
                        onClick={() => reviewLeave(leave.id, "ACTIVE")}
                      >
                        <BusyLabel busy={reviewingId === leave.id} idle="Approve" busyText="…" />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={reviewingId === leave.id}
                        onClick={() => reviewLeave(leave.id, "REJECTED")}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canApproveLeave && (
        <form onSubmit={submitLeave} className="card p-4 sm:p-5 space-y-3 max-w-xl">
          <h3 className="font-serif text-2xl">Put a teacher on leave</h3>
          <p className="text-sm text-ink-700/65">
            Approved leave overlays the weekly timetable for those dates. Principal, vice principal,
            supervisors, and coordinators are notified. Auto-suggest picks a{" "}
            <span className="font-medium text-ink-800">different free teacher for each vacated period</span>{" "}
            so the load stays balanced.
          </p>
          {error && <p className="text-sm text-clay-600">{error}</p>}
          <label className="block">
            <span className="label">Teacher</span>
            <select
              className="field"
              required
              value={form.teacherId}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
            >
              <option value="">Select teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Start</span>
              <input
                type="date"
                className="field"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">End</span>
              <input
                type="date"
                className="field"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </label>
          </div>
          <label className="block">
            <span className="label">Reason (optional)</span>
            <input
              className="field"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Sick leave, training, …"
            />
          </label>
          {canAssignSubs && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.suggestCovers}
                onChange={(e) => setForm({ ...form, suggestCovers: e.target.checked })}
              />
              Suggest a different free teacher for each vacated period
            </label>
          )}
          <button type="submit" className="btn-primary" disabled={saving || !form.teacherId}>
            <BusyLabel busy={saving} idle="Save leave" busyText="Saving…" />
          </button>
        </form>
      )}

      {!canApproveLeave && !canAssignSubs && (
        <EmptyNote>Your role does not include leave approval or substitute assignment.</EmptyNote>
      )}

      {plan && canAssignSubs && (
        <div className="card p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-serif text-2xl">Cover planner</h3>
              <p className="text-sm text-ink-700/65">
                {plan.leave?.teacher?.name} · {plan.vacatedCount} vacated
                {plan.alreadyCoveredCount ? ` · ${plan.alreadyCoveredCount} already covered` : ""}
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setPlan(null)}>
              Dismiss
            </button>
          </div>

          {plan.planError && <p className="text-sm text-clay-600">{plan.planError}</p>}
          {!plan.suggestions?.length && !plan.uncovered?.length && (
            <EmptyNote>No teaching periods to cover in this leave range.</EmptyNote>
          )}

          {plan.suggestions?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Period</th>
                    <th>Class</th>
                    <th>Subject</th>
                    <th>Suggested substitute</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.suggestions.map((s) => {
                    const key = `${s.date}:${s.periodId}:${s.classSectionId}`;
                    const options = [
                      s.suggestedSubstitute,
                      ...(s.alternatives || []).map((a) => ({ id: a.id, name: a.name, score: a.score })),
                    ].filter(Boolean);
                    const seen = new Set();
                    const unique = options.filter((o) => {
                      if (!o?.id || seen.has(o.id)) return false;
                      seen.add(o.id);
                      return true;
                    });
                    return (
                      <tr key={key}>
                        <td>
                          {s.date}
                          <div className="text-[11px] text-ink-700/50">{s.dayName}</div>
                        </td>
                        <td>{s.period?.name || "—"}</td>
                        <td>{s.classSection?.label || "—"}</td>
                        <td>{s.subject?.name || "—"}</td>
                        <td>
                          <select
                            className="field"
                            value={selectedSubs[key] || ""}
                            onChange={(e) =>
                              setSelectedSubs((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          >
                            <option value="">Skip</option>
                            {unique.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                                {o.score != null ? ` (${Number(o.score).toFixed(1)})` : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="text-xs text-ink-700/60">
                          {s.score != null ? Number(s.score).toFixed(1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {plan.uncovered?.length > 0 && (
            <p className="text-sm text-clay-600">
              {plan.uncovered.length} slot{plan.uncovered.length === 1 ? "" : "s"} could not be
              auto-suggested — assign manually from the daily board.
            </p>
          )}

          {plan.suggestions?.length > 0 && (
            <button type="button" className="btn-primary" disabled={accepting} onClick={acceptSuggestions}>
              <BusyLabel busy={accepting} idle="Accept selected covers" busyText="Saving…" />
            </button>
          )}
        </div>
      )}

      <div>
        <h3 className="font-serif text-2xl mb-2">Active leave nearby</h3>
        {!leaves && <InlineLoading label="Loading leaves…" />}
        {leaves && !leaves.length && <EmptyNote>No active leave in this window.</EmptyNote>}
        {leaves && leaves.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Dates</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave) => (
                  <tr key={leave.id}>
                    <td>{leave.teacher?.name || "—"}</td>
                    <td>
                      {leave.startDate}
                      {leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ""}
                    </td>
                    <td>{leave.reason || "—"}</td>
                    <td className="text-right whitespace-nowrap">
                      {canAssignSubs && (
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => loadPlan(leave.id)}
                        >
                          Plan covers
                        </button>
                      )}
                      {canApproveLeave && (
                        <button
                          type="button"
                          className="btn-ghost text-xs text-clay-600"
                          onClick={() => cancelLeave(leave.id)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

