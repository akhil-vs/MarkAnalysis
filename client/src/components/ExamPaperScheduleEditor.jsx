import { useEffect, useMemo, useState } from "react";

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

export function firstClassFromDrafts(drafts = []) {
  const classes = [
    ...new Set((drafts || []).map((d) => d.className).filter(Boolean)),
  ].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  return classes[0] || "";
}

/**
 * Per-class / per-subject exam paper date editor used by Records → Exams.
 * Class selection comes first; subject dates are shown for that class only.
 */
export default function ExamPaperScheduleEditor({
  drafts,
  onChange,
  disabled = false,
  selectedClass = "",
  onSelectedClassChange,
}) {
  const [classDate, setClassDate] = useState("");
  const [allClassesDate, setAllClassesDate] = useState("");

  const classOptions = useMemo(
    () =>
      [...new Set((drafts || []).map((d) => d.className).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true })
      ),
    [drafts]
  );

  // Keep a class selected whenever options exist.
  useEffect(() => {
    if (!classOptions.length) return;
    if (selectedClass && classOptions.includes(selectedClass)) return;
    onSelectedClassChange?.(classOptions[0]);
  }, [classOptions, selectedClass, onSelectedClassChange]);

  const classRows = useMemo(() => {
    if (!selectedClass) return [];
    return (drafts || []).filter((d) => String(d.className) === String(selectedClass));
  }, [drafts, selectedClass]);

  const datedCount = (drafts || []).filter((d) => d.paperDate).length;
  const classDatedCount = classRows.filter((d) => d.paperDate).length;

  const classStatus = useMemo(() => {
    return classOptions.map((className) => {
      const rows = (drafts || []).filter((d) => String(d.className) === String(className));
      const dated = rows.filter((d) => d.paperDate).length;
      return { className, total: rows.length, dated };
    });
  }, [classOptions, drafts]);

  function patchRow(subjectId, patch) {
    onChange(
      (drafts || []).map((row) => (row.subjectId === subjectId ? { ...row, ...patch } : row))
    );
  }

  function applyToSelectedClass() {
    if (!classDate || !selectedClass) return;
    onChange(
      (drafts || []).map((row) =>
        String(row.className) === String(selectedClass)
          ? { ...row, paperDate: classDate }
          : row
      )
    );
  }

  function applyToAllClasses() {
    if (!allClassesDate) return;
    onChange((drafts || []).map((row) => ({ ...row, paperDate: allClassesDate })));
  }

  function clearSelectedClass() {
    if (!selectedClass) return;
    onChange(
      (drafts || []).map((row) =>
        String(row.className) === String(selectedClass)
          ? { ...row, paperDate: "", startTime: "", endTime: "" }
          : row
      )
    );
  }

  if (!(drafts || []).length) {
    return (
      <div className="rounded-md border border-ink-900/10 bg-cream/40 p-3 text-sm text-ink-700/70">
        Add subjects under Records → Subjects first. Choose a class here, then set each subject’s
        exam date — same day or different days.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-ink-900/10 p-3">
      <div>
        <h4 className="font-medium text-ink-800">Paper dates by class &amp; subject</h4>
        <p className="text-xs text-ink-700/55 mt-0.5">
          Choose a class first, then set subject dates for that class. Switch classes to schedule
          the rest.
          {datedCount ? ` ${datedCount} of ${drafts.length} papers dated overall.` : " No papers dated yet."}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="exam-paper-class">
          Class
        </label>
        <select
          id="exam-paper-class"
          className="field max-w-xs"
          value={selectedClass}
          onChange={(e) => onSelectedClassChange?.(e.target.value)}
          disabled={disabled || classOptions.length === 0}
          aria-label="Select class for paper dates"
          required
        >
          {classOptions.length === 0 ? (
            <option value="">No classes with subjects</option>
          ) : (
            classOptions.map((c) => {
              const status = classStatus.find((s) => s.className === c);
              const label =
                status && status.dated
                  ? `Class ${c} (${status.dated}/${status.total} dated)`
                  : `Class ${c}`;
              return (
                <option key={c} value={c}>
                  {label}
                </option>
              );
            })
          )}
        </select>
        {classOptions.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {classStatus.map((s) => (
              <button
                key={s.className}
                type="button"
                className={
                  String(s.className) === String(selectedClass)
                    ? "btn-primary text-xs px-2.5 py-1"
                    : "btn-ghost text-xs px-2.5 py-1"
                }
                disabled={disabled}
                onClick={() => onSelectedClassChange?.(s.className)}
              >
                {s.className}
                <span className="ml-1 opacity-70">
                  {s.dated}/{s.total}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {selectedClass ? (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="label">Apply one date to class {selectedClass}</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="field"
                  value={classDate}
                  disabled={disabled}
                  onChange={(e) => setClassDate(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={disabled || !classDate}
                  onClick={applyToSelectedClass}
                >
                  Apply to class
                </button>
              </div>
            </div>
            <div>
              <label className="label">Same date for every class</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className="field"
                  value={allClassesDate}
                  disabled={disabled}
                  onChange={(e) => setAllClassesDate(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={disabled || !allClassesDate}
                  onClick={applyToAllClasses}
                >
                  Apply all classes
                </button>
              </div>
            </div>
            <button type="button" className="btn-ghost" disabled={disabled} onClick={clearSelectedClass}>
              Clear class {selectedClass}
            </button>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-700/50 mb-1.5">
              Class {selectedClass} subjects
              {classDatedCount
                ? ` · ${classDatedCount} of ${classRows.length} dated`
                : " · none dated yet"}
            </div>
            <div className="max-h-80 overflow-auto">
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
                  {classRows.map((row) => (
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
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-700/60">Select a class to set subject dates.</p>
      )}
    </div>
  );
}
