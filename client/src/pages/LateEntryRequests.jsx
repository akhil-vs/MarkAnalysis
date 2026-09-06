import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";

function statusTone(status) {
  if (status === "APPROVED") return "mark-chip mark-chip-approved";
  if (status === "REJECTED") return "mark-chip mark-chip-dirty";
  if (status === "PENDING") return "mark-chip mark-chip-pending";
  return "mark-chip mark-chip-empty";
}

function statusLabel(status) {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  if (status === "PENDING") return "Pending";
  return status || "—";
}

function kindLabel(kind) {
  if (kind === "EDIT") return "Edit";
  if (kind === "LATE_ENTRY") return "Late entry";
  return kind || "Late entry";
}

function kindTone(kind) {
  if (kind === "EDIT") return "mark-chip mark-chip-submitted";
  return "mark-chip mark-chip-pending";
}

export default function LateEntryRequests() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [kind, setKind] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("ok");
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(exam = examId, st = status, k = kind) {
    const params = new URLSearchParams();
    if (exam) params.set("examId", exam);
    if (st) params.set("status", st);
    if (k) params.set("kind", k);
    setLoading(true);
    try {
      setRows(await api(`/api/mark-access?${params}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api("/api/exams")
      .then((e) => {
        setExams(e);
        if (e.at(-1)) setExamId(e.at(-1).id);
      })
      .catch((err) => {
        setMessageTone("error");
        setMessage(err.message || "Could not load exams");
      });
  }, []);

  useEffect(() => {
    if (!examId && exams.length) return;
    load(examId, status, kind).catch((e) => {
      setMessageTone("error");
      setMessage(e.message);
    });
  }, [examId, status, kind, exams.length]);

  async function review(id, nextStatus) {
    setMessage("");
    setBusyId(id);
    try {
      const updated = await api(`/api/mark-access/${id}`, {
        method: "PATCH",
        body: { status: nextStatus },
      });

      const reviewedAt = updated.reviewedAt || new Date().toISOString();
      const reviewedBy = updated.reviewedBy || { id: user?.id, name: user?.name };

      // Show the decision immediately in the table, even before filter reload.
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                ...updated,
                status: nextStatus,
                reviewedAt,
                reviewedBy,
                classLabel: updated.classLabel || row.classLabel,
              }
            : row
        )
      );

      setMessageTone("ok");
      const existing = rows.find((row) => row.id === id);
      const isEdit = (updated.kind || existing?.kind) === "EDIT";
      setMessage(
        nextStatus === "APPROVED"
          ? isEdit
            ? "Edit request approved. The teacher can edit and resubmit marks."
            : "Late entry approved. The teacher can enter marks now."
          : isEdit
            ? "Edit request rejected."
            : "Late entry request rejected."
      );

      // Move to the matching status filter so the updated row stays visible with confirmation.
      if (status === "PENDING" || status === "") {
        setStatus(nextStatus);
      } else {
        await load(examId, status, kind);
      }
    } catch (err) {
      setMessageTone("error");
      setMessage(err.message || "Could not update late entry request");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <PageHeader
        title="Late mark entry"
        subtitle="Teachers request late entry after the deadline or edit access for submitted registers."
        actions={
          <>
            <select className="field w-auto" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {!examId && <option value="">Select exam</option>}
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="">All</option>
            </select>
            <select className="field w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All kinds</option>
              <option value="LATE_ENTRY">Late entry</option>
              <option value="EDIT">Edit</option>
            </select>
          </>
        }
      />

      {message && (
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            messageTone === "error" ? "bg-[#fbf4ec] text-clay-600" : "bg-[#eef5f0] text-moss-600"
          }`}
        >
          {message}
        </p>
      )}

      <div className="card overflow-hidden">
        {loading && !rows.length ? (
          <p className="p-4 text-sm text-ink-700/60">Loading requests…</p>
        ) : (
          <PaginatedTable items={rows} resetKey={`${examId}:${status}:${kind}`} empty="No mark access requests.">
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Kind</th>
                    <th>Exam</th>
                    <th>Register</th>
                    <th>Requested</th>
                    <th>Status</th>
                    <th>Accepted / Rejected</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.teacher?.name || "—"}</td>
                      <td>
                        <span className={kindTone(r.kind)}>{kindLabel(r.kind)}</span>
                      </td>
                      <td>{r.exam?.name || "—"}</td>
                      <td>
                        {r.classLabel || r.classSectionId} · {r.subject?.name || "—"}
                      </td>
                      <td>{r.requestedAt ? new Date(r.requestedAt).toLocaleString() : "—"}</td>
                      <td>
                        <span className={statusTone(r.status)}>{statusLabel(r.status)}</span>
                      </td>
                      <td>
                        {r.reviewedAt ? (
                          <div>
                            <div>{new Date(r.reviewedAt).toLocaleString()}</div>
                            {r.reviewedBy?.name && (
                              <div className="text-[10px] text-ink-700/50">by {r.reviewedBy.name}</div>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="space-x-2 whitespace-nowrap">
                        {r.status === "PENDING" && (
                          <>
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
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        )}
      </div>
    </div>
  );
}
