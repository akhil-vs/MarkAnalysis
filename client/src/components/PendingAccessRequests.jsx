import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { EmptyNote, Panel } from "./DashboardKit.jsx";

function kindLabel(kind) {
  return kind === "EDIT" ? "Edit marks" : "Late entry";
}

/**
 * Cross-exam pending late-entry / edit requests for leadership dashboards.
 * Not scoped to the selected analytics exam.
 */
export default function PendingAccessRequests({ className = "", limit = 8 }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/api/mark-access?status=PENDING");
      setRows(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load access requests");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id, status) {
    setBusyId(id);
    setMessage("");
    try {
      await api(`/api/mark-access/${id}`, { method: "PATCH", body: { status } });
      setRows((prev) => (prev || []).filter((r) => r.id !== id));
      setMessage(status === "APPROVED" ? "Request approved." : "Request rejected.");
    } catch (err) {
      setMessage(err.message || "Could not update request");
    } finally {
      setBusyId("");
    }
  }

  const list = rows || [];
  const shown = list.slice(0, limit);

  return (
    <Panel
      className={className}
      title="Access requests to approve"
      action={
        <Link className="text-xs underline text-ink-700/60" to="/late-entry?status=PENDING">
          {list.length ? `View all (${list.length})` : "Open queue"}
        </Link>
      }
    >
      {rows == null ? (
        <p className="text-sm text-ink-700/55">Loading requests…</p>
      ) : error ? (
        <p className="text-sm text-clay-600">{error}</p>
      ) : shown.length === 0 ? (
        <EmptyNote>No pending late-entry or edit requests across exams.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {message && <p className="text-xs text-moss-600">{message}</p>}
          {shown.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-900/5 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.teacher?.name || "Teacher"}</div>
                <div className="text-[11px] text-ink-700/55">
                  {kindLabel(r.kind)} · {r.exam?.name || "Exam"} · {r.classLabel || r.classSectionId} ·{" "}
                  {r.subject?.name || "Subject"}
                </div>
                {r.requestedAt && (
                  <div className="text-[10px] text-ink-700/40 mt-0.5">
                    {new Date(r.requestedAt).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={Boolean(busyId)}
                  onClick={() => review(r.id, "APPROVED")}
                >
                  {busyId === r.id ? "Saving…" : "Approve"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={Boolean(busyId)}
                  onClick={() => review(r.id, "REJECTED")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
