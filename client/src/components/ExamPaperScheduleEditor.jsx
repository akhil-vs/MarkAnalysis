import { useMemo, useState } from "react";

function toDateInput(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/**
 * Build editable draft rows from subjects + existing paper schedules.
 * One row per subject (subjects are already scoped to a class name).
 */
export function buildPaperDrafts(subjects = [], schedules = []) {
  const bySubject = new Map();
  for (const row of schedules || []) {
    if (!row?.subjectId) continue;
    bySubject.set(row.subjectId, row);
  }
  return (subjects || [])
    .slice()
    .sort((a, b) => {
      const c = String(a.className).localeCompare(String(b.className), undefined, { numeric: true });
      if (c) return c;
      return String(a.name).localeCompare(String(b.name));
    })
    .map((subject) => {
      const existing = bySubject.get(subject.id);
      return {
        subjectId: subject.id,
        subjectName: subject.name,
        className: subject.className,
        paperDate: toDateInput(existing?.paperDate),
        startTime: existing?.startTime || "",
        endTime: existing?.endTime || "",
        venue: existing?.venue || "",
        scheduleId: existing?.id || null,
      };
    });
}

export function papersPayloadFromDrafts(drafts = []) {
  return (drafts || [])
    .filter((row) => row.paperDate)
    .map((row) => ({
      subjectId: row.subjectId,
      className: row.className || null,
      paperDate: row.paperDate,
      startTime: row.startTime || null,
      endTime: row.endTime || null,
      venue: row.venue || null,
    }));
}

/**
 * Per-class / per-subject exam paper date editor used by Records → Exams.
 */
export default function ExamPaperScheduleEditor({
  drafts,
  onChange,
  disabled = false,
  classFilter = "",
  onClassFilterChange,
}) {
  const [bulkDate, setBulkDate] = useState("");
  const [classBulkDate, setClassBulkDate] = useState("");

  const classOptions = useMemo(
    () =>
      [...new Set((drafts || []).map((d) => d.className).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true })
      ),
    [drafts]
  );

  const visible = useMemo(() => {
    if (!classFilter) return drafts || [];
    return (drafts || []).filter((d) => String(d.className) === String(classFilter));
  }, [drafts, classFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of visible) {
      const key = row.className || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()];
  }, [visible]);

  const datedCount = (drafts || []).filter((d) => d.paperDate).length;

  function patchRow(subjectId, patch) {
    onChange(
      (drafts || []).map((row) => (row.subjectId === subjectId ? { ...row, ...patch } : row))
    );
  }

  function applyToAll() {
    if (!bulkDate) return;
    onChange((drafts || []).map((row) => ({ ...row, paperDate: bulkDate })));
  }

  function applyToVisibleClass() {
    if (!classBulkDate || !classFilter) return;
    onChange(
      (drafts || []).map((row) =>
        String(row.className) === String(classFilter)
          ? { ...row, paperDate: classBulkDate }
          : row
      )
    );
  }

  function clearVisible() {
    if (!classFilter) {
      onChange((drafts || []).map((row) => ({ ...row, paperDate: "", startTime: "", endTime: "" })));
      return;
    }
    onChange(
      (drafts || []).map((row) =>
        String(row.className) === String(classFilter)
          ? { ...row, paperDate: "", startTime: "", endTime: "" }
          : row
      )
    );
  }

  if (!(drafts || []).length) {
    return (
      <div className="rounded-md border border-ink-900/10 bg-cream/40 p-3 text-sm text-ink-700/70">
        Add subjects under Records → Subjects first. Each subject (per class) can then get its own
        exam date here — same day or different days.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-ink-900/10 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="font-medium text-ink-800">Paper dates by class &amp; subject</h4>
          <p className="text-xs text-ink-700/55 mt-0.5">
            Set the same date for every paper, or different dates per class and subject.
            {datedCount ? ` ${datedCount} of ${drafts.length} dated.` : " No papers dated yet."}
          </p>
        </div>
        <select
          className="field-filter"
          value={classFilter}
          onChange={(e) => onClassFilterChange?.(e.target.value)}
          disabled={disabled}
          aria-label="Filter paper schedule by class"
        >
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              Class {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="label">Apply date to all papers</label>
          <div className="flex gap-2">
            <input
              type="date"
              className="field"
              value={bulkDate}
              disabled={disabled}
              onChange={(e) => setBulkDate(e.target.value)}
            />
            <button type="button" className="btn-ghost" disabled={disabled || !bulkDate} onClick={applyToAll}>
              Apply all
            </button>
          </div>
        </div>
        {classFilter ? (
          <div>
            <label className="label">Apply to class {classFilter}</label>
            <div className="flex gap-2">
              <input
                type="date"
                className="field"
                value={classBulkDate}
                disabled={disabled}
                onChange={(e) => setClassBulkDate(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={disabled || !classBulkDate}
                onClick={applyToVisibleClass}
              >
                Apply class
              </button>
            </div>
          </div>
        ) : null}
        <button type="button" className="btn-ghost" disabled={disabled} onClick={clearVisible}>
          Clear {classFilter ? `class ${classFilter}` : "all"} dates
        </button>
      </div>

      <div className="max-h-80 overflow-auto space-y-4">
        {grouped.map(([className, rows]) => (
          <div key={className}>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-700/50 mb-1.5">
              Class {className}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Date</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.subjectId}>
                    <td className="whitespace-nowrap">{row.subjectName}</td>
                    <td>
                      <input
                        type="date"
                        className="field w-[9.5rem]"
                        value={row.paperDate}
                        disabled={disabled}
                        onChange={(e) => patchRow(row.subjectId, { paperDate: e.target.value })}
                        aria-label={`Date for ${row.subjectName} class ${row.className}`}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className="field w-[7.5rem]"
                        value={row.startTime}
                        disabled={disabled}
                        onChange={(e) => patchRow(row.subjectId, { startTime: e.target.value })}
                        aria-label={`Start time for ${row.subjectName}`}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className="field w-[7.5rem]"
                        value={row.endTime}
                        disabled={disabled}
                        onChange={(e) => patchRow(row.subjectId, { endTime: e.target.value })}
                        aria-label={`End time for ${row.subjectName}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
