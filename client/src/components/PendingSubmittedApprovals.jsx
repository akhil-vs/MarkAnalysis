import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useConfirm } from "./ConfirmDialog.jsx";
import { EmptyNote, Panel } from "./DashboardKit.jsx";
import { BusyLabel, Spinner } from "./Spinner.jsx";
import { useToast } from "./Toast.jsx";
import { paths } from "../lib/nav.js";

/**
 * Cross-exam submitted marks waiting for leadership approval.
 * Approve in place — no need to pick exam/class first.
 */
export default function PendingSubmittedApprovals({ className = "", limit = 8, emptyMode }) {
  const { optimistic } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/api/analytics/awaiting-approvals");
      setRows(Array.isArray(data.items) ? data.items : []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load submitted marks");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (optimistic) return;
    load();
  }, [load, optimistic]);

  async function approve(row) {
    const key = `${row.examId}|${row.classSectionId}|${row.subjectId}|${row.teacherId}`;
    const ok = await confirm({
      title: "Approve this teacher’s submitted marks?",
      message: `Approve ${row.submittedCount} submitted mark${row.submittedCount === 1 ? "" : "s"} for ${row.teacherName} · ${row.examName} · ${row.classLabel} · ${row.subjectName}? Other teachers’ registers stay unpublished.`,
      confirmLabel: "Approve submitted",
    });
    if (!ok) return;

    setBusyKey(key);
    try {
      const res = await api("/api/marks/approve", {
        method: "POST",
        body: {
          examId: row.examId,
          classSectionId: row.classSectionId,
          subjectId: row.subjectId,
          teacherId: row.teacherId,
        },
      });
      setRows((prev) =>
        (prev || []).filter((r) => {
          const rKey = `${r.examId}|${r.classSectionId}|${r.subjectId}|${r.teacherId}`;
          return rKey !== key;
        })
      );
      toast.success(
        `Approved ${res.approved ?? 0} mark${res.approved === 1 ? "" : "s"} for ${row.teacherName} · ${row.subjectName}`
      );
    } catch (err) {
      toast.error(err.message || "Could not approve submitted marks");
    } finally {
      setBusyKey("");
    }
  }

  const list = rows || [];
  const shown = list.slice(0, limit);
  const queueLink = (
    <Link className="text-sm underline text-ink-700/70 shrink-0" to={paths.approvals()}>
      {list.length ? `View all (${list.length})` : "Open exam queue"}
    </Link>
  );

  if (emptyMode === "line" && (rows == null || shown.length === 0)) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-ink-900/10 bg-white/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p className="text-sm text-ink-800">
          <span className="font-medium">Submitted marks. </span>
          {rows == null ? (
            <span className="text-ink-700/70">Checking every exam…</span>
          ) : error ? (
            <span className="text-clay-600">{error}</span>
          ) : (
            <span className="text-ink-700/70">None waiting on any exam.</span>
          )}
        </p>
        {queueLink}
      </div>
    );
  }

  return (
    <Panel
      className={className}
      title="Submitted marks to approve"
      action={queueLink}
    >
      <p className="mb-3 text-xs leading-relaxed text-ink-700/60">
        These rows can belong to any exam. Approving one row does not approve another teacher’s register.
      </p>
      {rows == null ? (
        <p className="text-sm text-ink-700/55 inline-flex items-center gap-2">
          <Spinner className="h-3.5 w-3.5" label="" />
          Loading submitted marks…
        </p>
      ) : error ? (
        <p className="text-sm text-clay-600">{error}</p>
      ) : shown.length === 0 ? (
        <EmptyNote>No submissions currently waiting for approval.</EmptyNote>
      ) : (
        <div className={`relative ${busyKey ? "pointer-events-none" : ""}`}>
          {busyKey && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-cream/50 rounded-lg"
              role="status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-2 rounded-lg border border-ink-900/10 bg-white/95 px-3 py-2 text-sm text-ink-700 shadow-sm">
                <Spinner className="h-4 w-4" label="" />
                Approving…
              </div>
            </div>
          )}
          <div className="scroll-x">
            <table className="table table-cards w-full">
              <thead>
                <tr>
                  <th scope="col">Teacher</th>
                  <th scope="col">Exam</th>
                  <th scope="col">Class</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Submitted marks</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const key = `${row.examId}|${row.classSectionId}|${row.subjectId}|${row.teacherId}`;
                  return (
                    <tr key={key}>
                      <td data-label="Teacher" className="align-top font-medium">
                        {row.teacherName}
                      </td>
                      <td data-label="Exam" className="align-top">
                        {row.examName}
                      </td>
                      <td data-label="Class" className="align-top">
                        {row.classLabel}
                      </td>
                      <td data-label="Subject" className="align-top">
                        {row.subjectName}
                      </td>
                      <td data-label="Submitted marks" className="align-top tabular-nums">
                        {row.submittedCount}
                      </td>
                      <td data-label="" className="align-top">
                        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:justify-end">
                          <Link
                            className="btn-ghost text-xs w-full sm:w-auto justify-center"
                            to={paths.marks({
                              examId: row.examId,
                              classSectionId: row.classSectionId,
                              subjectId: row.subjectId,
                            })}
                          >
                            Open register
                          </Link>
                          <button
                            type="button"
                            className="btn-accent text-xs w-full sm:w-auto justify-center"
                            disabled={Boolean(busyKey)}
                            onClick={() => approve(row)}
                          >
                            <BusyLabel busy={busyKey === key} idle="Approve" busyText="Approving…" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}
