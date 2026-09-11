import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { useToast } from "./Toast.jsx";

const DAY_OPTIONS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 7, label: "Sun" },
];

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];
const FIVE_DAY_WORKING_DAYS = [1, 2, 3, 4, 5];

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

function normalizeWorkingDays(days) {
  const list = [...new Set((days || []).map(Number).filter((n) => n >= 1 && n <= 7))].sort(
    (a, b) => a - b
  );
  if (list.length === 5 || list.length === 6) return list;
  return [...DEFAULT_WORKING_DAYS];
}

function scheduleSnapshot(workingDays, rows) {
  return JSON.stringify({
    workingDays: normalizeWorkingDays(workingDays),
    periods: serializePeriods(rows),
  });
}

/**
 * School week (5/6 working days) + bell schedule. Lives on School profile.
 */
export function SchoolScheduleEditor() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [workingDays, setWorkingDays] = useState(DEFAULT_WORKING_DAYS);
  const [weekLength, setWeekLength] = useState(6);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function applyLoaded({ periods, workingDays: days }) {
    const drafts = (periods || []).map(toPeriodDraft);
    const nextDays = normalizeWorkingDays(days);
    setRows(drafts);
    setWorkingDays(nextDays);
    setWeekLength(nextDays.length === 5 ? 5 : 6);
    setSavedSnapshot(scheduleSnapshot(nextDays, drafts));
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([api("/api/timetable/periods"), api("/api/school")])
      .then(([periods, school]) => {
        if (!cancelled) applyLoaded({ periods, workingDays: school.workingDays });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load school schedule");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!rows) return false;
    return scheduleSnapshot(workingDays, rows) !== savedSnapshot;
  }, [rows, workingDays, savedSnapshot]);

  const teachingCount = useMemo(() => (rows || []).filter((r) => !r.isBreak).length, [rows]);

  function setWeekLengthChoice(nextLength) {
    const n = nextLength === 5 ? 5 : 6;
    setWeekLength(n);
    setWorkingDays((current) => {
      if (current.length === n) return current;
      if (n === 5) {
        return current.filter((d) => d <= 5).slice(0, 5).length === 5
          ? current.filter((d) => d <= 5).slice(0, 5)
          : [...FIVE_DAY_WORKING_DAYS];
      }
      const base = current.filter((d) => d <= 6);
      if (base.length === 6) return base;
      return [...DEFAULT_WORKING_DAYS];
    });
  }

  function toggleWorkingDay(day) {
    setWorkingDays((current) => {
      const has = current.includes(day);
      if (has) {
        if (current.length <= 1) return current;
        return current.filter((d) => d !== day);
      }
      if (current.length >= weekLength) return current;
      return [...current, day].sort((a, b) => a - b);
    });
  }

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
    const parsed = JSON.parse(savedSnapshot);
    applyLoaded({ periods: parsed.periods, workingDays: parsed.workingDays });
  }

  async function save() {
    if (!rows?.length) {
      toast.error("Keep at least one period in the bell schedule.");
      return;
    }
    const days = normalizeWorkingDays(workingDays);
    if (days.length !== weekLength) {
      toast.error(`Select exactly ${weekLength} working days for the school week.`);
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
      const [school, savedPeriods] = await Promise.all([
        api("/api/school", {
          method: "PATCH",
          body: { workingDays: days },
        }),
        api("/api/timetable/periods", {
          method: "PUT",
          body: { periods: serializePeriods(rows) },
        }),
      ]);
      applyLoaded({ periods: savedPeriods, workingDays: school.workingDays });
      toast.success("School week and bell schedule saved. Timetables use these settings.");
    } catch (err) {
      toast.error(err.message || "Could not save school schedule");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-clay-600">{error}</p>;
  if (!rows) return <p>Loading school schedule…</p>;

  const dayLabels = workingDays
    .map((d) => DAY_OPTIONS.find((o) => o.id === d)?.label || d)
    .join(", ");

  return (
    <div id="school-schedule" className="space-y-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl">School day periods and timings</h3>
          <p className="mt-1 text-sm text-ink-700/65">
            Set the working week and bell schedule used across teacher timetables, the daily board,
            and free-period finder.
          </p>
          <p className="mt-1 text-sm text-ink-700/55">
            {weekLength}-day week ({dayLabels}) · {rows.length} slots · {teachingCount} teaching
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

      <div className="card p-4 space-y-3">
        <div>
          <div className="label mb-2">Working week</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={weekLength === 5 ? "btn-primary" : "btn-ghost"}
              onClick={() => setWeekLengthChoice(5)}
              disabled={busy}
            >
              5-day week
            </button>
            <button
              type="button"
              className={weekLength === 6 ? "btn-primary" : "btn-ghost"}
              onClick={() => setWeekLengthChoice(6)}
              disabled={busy}
            >
              6-day week
            </button>
          </div>
          <p className="mt-2 text-sm text-ink-700/55">
            Choose which {weekLength} days the school runs. Teacher weekly grids and period assignment
            use these days.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((day) => {
            const checked = workingDays.includes(day.id);
            return (
              <label
                key={day.id}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                  checked ? "border-ink-900/25 bg-ink-900/[0.04]" : "border-ink-900/10 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleWorkingDay(day.id)}
                  disabled={busy}
                />
                {day.label}
              </label>
            );
          })}
        </div>
        {workingDays.length !== weekLength && (
          <p className="text-sm text-clay-600">
            Select exactly {weekLength} days (currently {workingDays.length}).
          </p>
        )}
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
