import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { EmptyNote } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { useToast } from "../components/Toast.jsx";
import { NAV_TITLES } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

const MODES = [
  { id: "teachers", label: "Teachers" },
  { id: "daily", label: "Daily board" },
  { id: "free", label: "Find free" },
  { id: "periods", label: "Periods" },
];

let periodDraftKey = 0;

function nextPeriodKey() {
  periodDraftKey += 1;
  return `new-${periodDraftKey}`;
}

function toPeriodDraft(period) {
  return {
    key: period.id || nextPeriodKey(),
    id: period.id || undefined,
    name: period.name || "",
    startTime: period.startTime || "08:00",
    endTime: period.endTime || "08:45",
    isBreak: Boolean(period.isBreak),
    entryCount: period.entryCount || 0,
  };
}

function suggestNextTimes(rows) {
  const last = rows[rows.length - 1];
  if (!last?.endTime) return { startTime: "08:00", endTime: "08:45" };
  const startTime = last.endTime;
  const [h, m] = startTime.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { startTime: "08:00", endTime: "08:45" };
  const endTotal = h * 60 + m + 45;
  const endH = String(Math.floor(endTotal / 60) % 24).padStart(2, "0");
  const endM = String(endTotal % 60).padStart(2, "0");
  return { startTime, endTime: `${endH}:${endM}` };
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

function SlotCell({ entries }) {
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  if (!list.length) {
    return (
      <div className="min-h-[3.25rem] rounded-lg bg-moss-500/10 px-2 py-1.5 text-[11px] text-moss-600">
        Free
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {list.map((entry) => (
        <div
          key={entry.id}
          className="min-h-[3.25rem] rounded-lg border border-ink-900/10 bg-white px-2 py-1.5"
        >
          <div className="text-sm font-medium leading-snug">{entry.subject?.name}</div>
          <div className="text-xs text-ink-700/65">{entry.classSection?.label}</div>
          {entry.room && <div className="text-[10px] text-ink-700/45">{entry.room}</div>}
        </div>
      ))}
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
        title={NAV_TITLES.timetables}
        subtitle="Browse teachers, the daily board, free periods, or edit the school bell schedule"
        actions={<ModeTabs mode={mode} onChange={setMode} />}
      />

      {mode === "teachers" && <TeachersList />}
      {mode === "daily" && <DailyBoard date={date} onDateChange={setDate} />}
      {mode === "free" && (
        <FreeFinder date={date} periodId={periodId} onDateChange={setDate} onPeriodChange={setPeriodId} />
      )}
      {mode === "periods" && <PeriodsEditor />}
    </div>
  );
}

function PeriodsEditor() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function applyLoaded(periods) {
    const drafts = (periods || []).map(toPeriodDraft);
    setRows(drafts);
    setSavedSnapshot(JSON.stringify(serializePeriods(drafts)));
  }

  useEffect(() => {
    let cancelled = false;
    api("/api/timetable/periods")
      .then((periods) => {
        if (!cancelled) applyLoaded(periods);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load periods");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!rows) return false;
    return JSON.stringify(serializePeriods(rows)) !== savedSnapshot;
  }, [rows, savedSnapshot]);

  const teachingCount = useMemo(() => (rows || []).filter((r) => !r.isBreak).length, [rows]);

  function updateRow(key, patch) {
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function moveRow(key, direction) {
    setRows((list) => {
      const index = list.findIndex((row) => row.key === key);
      if (index < 0) return list;
      const next = index + direction;
      if (next < 0 || next >= list.length) return list;
      const copy = [...list];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  function addRow({ isBreak }) {
    const times = suggestNextTimes(rows || []);
    const teachingN = (rows || []).filter((r) => !r.isBreak).length + (isBreak ? 0 : 1);
    setRows((list) => [
      ...(list || []),
      toPeriodDraft({
        name: isBreak ? "Break" : `Period ${teachingN}`,
        startTime: times.startTime,
        endTime: isBreak
          ? (() => {
              const [h, m] = times.startTime.split(":").map(Number);
              const end = h * 60 + m + 15;
              return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
            })()
          : times.endTime,
        isBreak,
        entryCount: 0,
      }),
    ]);
  }

  async function removeRow(row) {
    if ((rows || []).length <= 1) {
      toast.error("Keep at least one period in the bell schedule.");
      return;
    }
    if (row.entryCount > 0) {
      const ok = await confirm({
        title: "Remove period?",
        message: `Remove “${row.name || "this period"}”? ${row.entryCount} timetable slot${
          row.entryCount === 1 ? "" : "s"
        } using it will also be deleted.`,
        confirmLabel: "Remove period",
        tone: "danger",
      });
      if (!ok) return;
    }
    setRows((list) => list.filter((r) => r.key !== row.key));
  }

  function resetChanges() {
    if (!savedSnapshot) return;
    setRows(JSON.parse(savedSnapshot).map(toPeriodDraft));
  }

  async function save() {
    if (!rows?.length) {
      toast.error("Keep at least one period in the bell schedule.");
      return;
    }
    for (const row of rows) {
      if (!String(row.name || "").trim()) {
        toast.error("Every period needs a name.");
        return;
      }
      if (!row.startTime || !row.endTime) {
        toast.error("Every period needs start and end times.");
        return;
      }
      if (row.startTime >= row.endTime) {
        toast.error(`End time must be after start time for ${row.name}.`);
        return;
      }
    }
    setBusy(true);
    try {
      const saved = await api("/api/timetable/periods", {
        method: "PUT",
        body: { periods: serializePeriods(rows) },
      });
      applyLoaded(saved);
      toast.success("Bell schedule saved. Teacher timetables use these periods and timings.");
    } catch (err) {
      toast.error(err.message || "Could not save periods");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-clay-600">{error}</p>;
  if (!rows) return <p>Loading bell schedule…</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-700/65">
            Set the school day periods and timings used across teacher timetables, the daily board, and free-period finder.
          </p>
          <p className="mt-1 text-sm text-ink-700/55">
            {rows.length} slots · {teachingCount} teaching
            {dirty ? " · unsaved changes" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => addRow({ isBreak: false })} disabled={busy}>
            Add period
          </button>
          <button type="button" className="btn-ghost" onClick={() => addRow({ isBreak: true })} disabled={busy}>
            Add break
          </button>
          <button type="button" className="btn-ghost" onClick={resetChanges} disabled={busy || !dirty}>
            Discard
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save schedule"}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table min-w-[40rem]">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>Name</th>
              <th>Start</th>
              <th>End</th>
              <th>Break</th>
              <th>Slots</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className={row.isBreak ? "bg-ink-900/[0.03]" : undefined}>
                <td className="align-middle text-ink-700/55">{index + 1}</td>
                <td className="align-middle">
                  <input
                    className="field"
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                    disabled={busy}
                    aria-label={`Period ${index + 1} name`}
                  />
                </td>
                <td className="align-middle">
                  <input
                    type="time"
                    className="field"
                    value={row.startTime}
                    onChange={(e) => updateRow(row.key, { startTime: e.target.value })}
                    disabled={busy}
                    aria-label={`${row.name || `Period ${index + 1}`} start time`}
                  />
                </td>
                <td className="align-middle">
                  <input
                    type="time"
                    className="field"
                    value={row.endTime}
                    onChange={(e) => updateRow(row.key, { endTime: e.target.value })}
                    disabled={busy}
                    aria-label={`${row.name || `Period ${index + 1}`} end time`}
                  />
                </td>
                <td className="align-middle">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.isBreak}
                      onChange={(e) => updateRow(row.key, { isBreak: e.target.checked })}
                      disabled={busy}
                    />
                    Break
                  </label>
                </td>
                <td className="align-middle text-sm text-ink-700/60">
                  {row.isBreak ? "—" : row.entryCount}
                </td>
                <td className="align-middle">
                  <div className="flex flex-wrap justify-end gap-1">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => moveRow(row.key, -1)}
                      disabled={busy || index === 0}
                      aria-label="Move up"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => moveRow(row.key, 1)}
                      disabled={busy || index === rows.length - 1}
                      aria-label="Move down"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => removeRow(row)}
                      disabled={busy || rows.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function serializePeriods(rows) {
  return rows.map((row, index) => ({
    ...(row.id ? { id: row.id } : {}),
    name: String(row.name || "").trim(),
    sortOrder: index + 1,
    startTime: normalizeTime(row.startTime),
    endTime: normalizeTime(row.endTime),
    isBreak: Boolean(row.isBreak),
    ...(row.id ? { entryCount: row.entryCount || 0 } : {}),
  }));
}

function normalizeTime(value) {
  const parts = String(value || "").trim().split(":");
  if (parts.length < 2) return String(value || "").trim();
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return String(value || "").trim();
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
                          <SlotCell entries={teacher.entriesByPeriodId?.[period.id]} />
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
                    {result.busy.flatMap((t) => {
                      const entries = t.entries?.length ? t.entries : t.entry ? [t.entry] : [];
                      return entries.map((entry) => (
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
