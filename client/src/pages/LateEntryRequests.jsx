import { useEffect, useState } from "react";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";

export default function LateEntryRequests() {
  const [rows, setRows] = useState([]);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [message, setMessage] = useState("");

  async function load(exam = examId, st = status) {
    const params = new URLSearchParams();
    if (exam) params.set("examId", exam);
    if (st) params.set("status", st);
    setRows(await api(`/api/mark-access?${params}`));
  }

  useEffect(() => {
    api("/api/exams").then((e) => {
      setExams(e);
      if (e.at(-1)) setExamId(e.at(-1).id);
    });
  }, []);

  useEffect(() => {
    load(examId, status).catch((e) => setMessage(e.message));
  }, [examId, status]);

  async function review(id, nextStatus) {
    setMessage("");
    try {
      await api(`/api/mark-access/${id}`, { method: "PATCH", body: { status: nextStatus } });
      setMessage(nextStatus === "APPROVED" ? "Late entry approved." : "Request rejected.");
      load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Late mark entry"
        subtitle="Teachers request access after the exam deadline. Approve to unlock their register."
        actions={
          <>
            <select className="field w-auto" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="">All</option>
            </select>
          </>
        }
      />
      {message && <p className="mb-3 text-sm">{message}</p>}
      <div className="card">
        <PaginatedTable items={rows} resetKey={`${examId}:${status}`} empty="No late entry requests.">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Teacher</th>
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
                    <td>{r.teacher.name}</td>
                    <td>{r.exam.name}</td>
                    <td>{r.classLabel} · {r.subject.name}</td>
                    <td>{new Date(r.requestedAt).toLocaleString()}</td>
                    <td>{r.status}</td>
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
                          <button className="btn-primary" onClick={() => review(r.id, "APPROVED")}>Approve</button>
                          <button className="btn-ghost" onClick={() => review(r.id, "REJECTED")}>Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </div>
    </div>
  );
}
