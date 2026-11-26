import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EmptyNote, Panel } from "./DashboardKit.jsx";
import { BusyLabel, Spinner } from "./Spinner.jsx";
import { useToast } from "./Toast.jsx";
import { paths } from "../lib/nav.js";

function kindLabel(kind) {
  return kind === "EDIT" ? "Edit marks" : "Late entry";
}

/**
 * Cross-exam pending late-entry / edit requests for leadership dashboards.
 * Not scoped to the selected analytics exam.
 */
export default function PendingAccessRequests({ className = "", limit = 8, emptyMode }) {
  const { optimistic } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

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
    if (optimistic) return;
    load();
  }, [load, optimistic]);

  async function review(id, status) {
    setBusyId(id);
    try {
      await api(`/api/mark-access/${id}`, { method: "PATCH", body: { status } });
      setRows((prev) => (prev || []).filter((r) => r.id !== id));
      toast.success(status === "APPROVED" ? "Request approved." : "Request rejected.");
    } catch (err) {
      toast.error(err.message || "Could not update request");
    } finally {
      setBusyId("");
    }
  }

  const list = rows || [];
  const shown = list.slice(0, limit);
  const queueLink = (
    <Link className="text-sm underline text-ink-700/70 shrink-0" to={paths.accessRequests({ status: "PENDING" })}>
      {list.length ? `View all (${list.length})` : "Open exam queue"}
    </Link>
  );

  if (emptyMode === "line" && (rows == null || shown.length === 0)) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-ink-900/10 bg-white/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <p className="text-sm text-ink-800">
          <span className="font-medium">Access requests. </span>
          {rows == null ? (
            <span className="text-ink-700/70">Checking every exam…</span>
          ) : error ? (
            <span className="text-clay-600">{error}</span>
          ) : (
            <span className="text-ink-700/70">No late-entry or edit requests are pending.</span>
          )}
        </p>
        {queueLink}
      </div>
    );
  }

  return (
    <Panel
      className={className}
      title="Access requests to approve"
      action={queueLink}
    >
      <p className="mb-3 text-xs leading-relaxed text-ink-700/60">
        A late-entry request asks to add marks after the deadline. An edit request asks to change marks already
        saved. These rows can belong to any exam.
      </p>
      {rows == null ? (
        <p className="text-sm text-ink-700/55 inline-flex items-center gap-2">
          <Spinner className="h-3.5 w-3.5" label="" />
          Loading requests…
        </p>
      ) : error ? (
        <p className="text-sm text-clay-600">{error}</p>
      ) : shown.length === 0 ? (
        <EmptyNote>No pending access requests at the moment.</EmptyNote>
      ) : (
        <div className={`relative ${busyId ? "pointer-events-none" : ""}`}>
          {busyId && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-cream/50 rounded-lg"
              role="status"
              aria-live="polite"
            >
              <div className="inline-flex items-center gap-2 rounded-lg border border-ink-900/10 bg-white/95 px-3 py-2 text-sm text-ink-700 shadow-sm">
                <Spinner className="h-4 w-4" label="" />
                Updating…
              </div>
            </div>
          )}
          <div className="scroll-x">
            <table className="table table-cards w-full">
              <thead>
                <tr>
                  <th scope="col">Teacher</th>
                  <th scope="col">Request</th>
                  <th scope="col">Exam</th>
                  <th scope="col">Class</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Requested</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Teacher" className="align-top font-medium">
                      {row.teacher?.name || "Teacher"}
                    </td>
                    <td data-label="Request" className="align-top">
                      {kindLabel(row.kind)}
                    </td>
                    <td data-label="Exam" className="align-top">
                      {row.exam?.name || "Exam"}
                    </td>
                    <td data-label="Class" className="align-top">
                      {row.classLabel || row.classSectionId}
                    </td>
                    <td data-label="Subject" className="align-top">
                      {row.subject?.name || "Subject"}
                    </td>
                    <td data-label="Requested" className="align-top whitespace-normal">
                      {row.requestedAt ? new Date(row.requestedAt).toLocaleString() : "—"}
                    </td>
                    <td data-label="" className="align-top">
                      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:justify-end">
                        <button
                          type="button"
                          className="btn-primary text-xs w-full sm:w-auto justify-center"
                          disabled={Boolean(busyId)}
                          onClick={() => review(row.id, "APPROVED")}
                        >
                          <BusyLabel busy={busyId === row.id} idle="Approve" busyText="Saving…" />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-xs w-full sm:w-auto justify-center"
                          disabled={Boolean(busyId)}
                          onClick={() => review(row.id, "REJECTED")}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}
