import { useEffect, useMemo, useState } from "react";
import {
  buildPaperDrafts,
  copyClassScheduleToAll,
  firstClassFromDrafts,
  papersPayloadFromDrafts,
} from "../lib/examPaperSchedule.js";

export {
  buildPaperDrafts,
  copyClassScheduleToAll,
  firstClassFromDrafts,
  papersPayloadFromDrafts,
};

export default function ExamPaperScheduleEditor({
  drafts,
  onChange,
  disabled = false,
  selectedClass = "",
  onSelectedClassChange,
  emptyMessage = null,
}) {
  const [classDate, setClassDate] = useState("");
  const [classStartTime, setClassStartTime] = useState("");
  const [classEndTime, setClassEndTime] = useState("");
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
  const timedCount = (drafts || []).filter(
    (d) => d.paperDate && String(d.startTime || "").trim()
  ).length;
  const classDatedCount = classRows.filter((d) => d.paperDate).length;
  const classTimedCount = classRows.filter(
    (d) => d.paperDate && String(d.startTime || "").trim()
  ).length;

  const classStatus = useMemo(() => {
    return classOptions.map((className) => {
      const rows = (drafts || []).filter((d) => String(d.className) === String(className));
      const dated = rows.filter((d) => d.paperDate).length;
      const timed = rows.filter((d) => d.paperDate && String(d.startTime || "").trim()).length;
      return { className, total: rows.length, dated, timed };
    });
  }, [classOptions, drafts]);

  function patchRow(subjectId, patch) {
    onChange(
      (drafts || []).map((row) => (row.subjectId === subjectId ? { ...row, ...patch } : row))
    );
  }

  function applyToSelectedClass() {
    if (!selectedClass) return;
    if (!classDate && !classStartTime && !classEndTime) return;
    onChange(
      (drafts || []).map((row) => {
        if (String(row.className) !== String(selectedClass)) return row;
        return {
          ...row,
          ...(classDate ? { paperDate: classDate } : {}),
          ...(classStartTime ? { startTime: classStartTime } : {}),
          ...(classEndTime ? { endTime: classEndTime } : {}),
        };
      })
    );
  }

  function applyToAllClasses() {
    if (!allClassesDate) return;
    onChange((drafts || []).map((row) => ({ ...row, paperDate: allClassesDate })));
  }

  function copySelectedClassToAll() {
    if (!selectedClass) return;
    onChange(copyClassScheduleToAll(drafts, selectedClass));
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
        {emptyMessage ||
          "Add subjects under Records → Subjects first. Choose a class here, then set each subject’s exam date — same day or different days."}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-ink-900/10 p-3">
      <div>
        <h4 className="font-medium text-ink-800">Paper dates by class &amp; subject</h4>
        <p className="text-xs text-ink-700/55 mt-0.5">
          Choose a class, set each subject’s date and start time, then copy that timetable to other
          classes if they share the same papers. Hall tickets need a start time on every paper.
          {datedCount
            ? ` ${datedCount} of ${drafts.length} dated · ${timedCount} with start times.`
            : " No papers dated yet."}
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
                  ? `Class ${c} (${status.timed}/${status.total} timed)`
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
                title={`${s.dated} dated · ${s.timed} with start times`}
              >
                {s.className}
                <span className="ml-1 opacity-70">
                  {s.timed}/{s.total}
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
              <label className="label">Apply to class {selectedClass}</label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="date"
                  className="field"
                  value={classDate}
                  disabled={disabled}
                  onChange={(e) => setClassDate(e.target.value)}
                  aria-label={`Date to apply to class ${selectedClass}`}
                />
                <input
                  type="time"
                  className="field w-[7.5rem]"
                  value={classStartTime}
                  disabled={disabled}
                  onChange={(e) => setClassStartTime(e.target.value)}
                  aria-label={`Start time to apply to class ${selectedClass}`}
                />
                <input
                  type="time"
                  className="field w-[7.5rem]"
                  value={classEndTime}
                  disabled={disabled}
                  onChange={(e) => setClassEndTime(e.target.value)}
                  aria-label={`End time to apply to class ${selectedClass}`}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={disabled || (!classDate && !classStartTime && !classEndTime)}
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
            {classOptions.length > 1 ? (
              <button
                type="button"
                className="btn-ghost"
                disabled={disabled || classTimedCount === 0}
                onClick={copySelectedClassToAll}
                title="Copy this class’s dates and times onto matching subjects in every other class"
              >
                Copy class {selectedClass} timetable to all classes
              </button>
            ) : null}
            <button type="button" className="btn-ghost" disabled={disabled} onClick={clearSelectedClass}>
              Clear class {selectedClass}
            </button>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-700/50 mb-1.5">
              Class {selectedClass} subjects
              {classDatedCount
                ? ` · ${classDatedCount} of ${classRows.length} dated · ${classTimedCount} timed`
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
