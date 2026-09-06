import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { EmptyNote, Panel } from "./DashboardKit.jsx";

/**
 * Cross-exam submitted marks waiting for leadership approval.
 * Approve in place — no need to pick exam/class first.
 */
export default function PendingSubmittedApprovals({ className = "", limit = 8 }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");

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
    load();
  }, [load]);

  async function approve(row) {
    const key = `${row.examId}|${row.classSectionId}|${row.subjectId}|${row.teacherId}`;
    const ok = await confirm({
      title: "Approve this teacher’s submitted marks?",
      message: `Approve ${row.submittedCount} submitted mark${row.submittedCount === 1 ? "" : "s"} for ${row.teacherName} · ${row.examName} · ${row.classLabel} · ${row.subjectName}? Other teachers’ registers stay unpublished.`,
      confirmLabel: "Approve submitted",
    });
    if (!ok) return;

    setBusyKey(key);
    setMessage("");
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
      setRows((prev) => (prev || []).filter((r) => {
        const rKey = `${r.examId}|${r.classSectionId}|${r.subjectId}|${r.teacherId}`;
        return rKey !== key;
      }));
      setMessage(
        `Approved ${res.approved ?? 0} mark${res.approved === 1 ? "" : "s"} for ${row.teacherName} · ${row.subjectName}`
      );
    } catch (err) {
      setMessage(err.message || "Could not approve submitted marks");
    } finally {
      setBusyKey("");
    }
  }

  const list = rows || [];
  const shown = list.slice(0, limit);

  return (
    <Panel
      className={className}
      title="Submitted marks to approve"
      action={
        <Link className="text-xs underline text-ink-700/60" to="/pending-uploads">
          {list.length ? `View all (${list.length})` : "Open upload queue"}
        </Link>
      }
    >
      {rows == null ? (
        <p className="text-sm text-ink-700/55">Loading submitted marks…</p>
      ) : error ? (
        <p className="text-sm text-clay-600">{error}</p>
      ) : shown.length === 0 ? (
        <EmptyNote>No submitted registers waiting for approval across exams.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {message && <p className="text-xs text-moss-600">{message}</p>}
          {shown.map((r) => {
            const key = `${r.examId}|${r.classSectionId}|${r.subjectId}|${r.teacherId}`;
            return (
              <div
                key={key}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-900/5 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.teacherName}</div>
                  <div className="text-[11px] text-ink-700/55">
                    {r.examName} · {r.classLabel} · {r.subjectName}
                  </div>
                  <div className="text-[10px] text-ink-700/40 mt-0.5">
                    {r.submittedCount} submitted mark{r.submittedCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Link
                    className="btn-ghost text-xs"
                    to={`/marks?examId=${encodeURIComponent(r.examId)}&classSectionId=${encodeURIComponent(
                      r.classSectionId
                    )}&subjectId=${encodeURIComponent(r.subjectId)}`}
                  >
                    Open register
                  </Link>
                  <button
                    type="button"
                    className="btn-accent"
                    disabled={Boolean(busyKey)}
                    onClick={() => approve(r)}
                  >
                    {busyKey === key ? "Approving…" : "Approve submitted"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
