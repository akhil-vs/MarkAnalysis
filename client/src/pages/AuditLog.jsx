import { useEffect, useState } from "react";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { describeAuditValue } from "../lib/markCodes.js";

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");

  async function load(id) {
    const q = id ? `?examId=${id}` : "";
    setRows(await api(`/api/marks/audit${q}`));
  }

  useEffect(() => {
    api("/api/exams").then((e) => {
      setExams(e);
      if (e[0]) {
        setExamId(e.at(-1).id);
        load(e.at(-1).id);
      } else load("");
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="Marks audit"
        subtitle="Who changed what, and when"
        actions={
          <select
            className="field w-auto"
            value={examId}
            onChange={(e) => {
              setExamId(e.target.value);
              load(e.target.value);
            }}
          >
            {exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        }
      />
      <div className="card">
        <PaginatedTable items={rows} resetKey={examId} empty="No edits recorded for this exam yet.">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Student</th>
                  <th>Subject</th>
                  <th>Exam</th>
                  <th>Old</th>
                  <th>New</th>
                </tr>
              </thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.timestamp).toLocaleString()}</td>
                    <td>{r.changedBy.name}</td>
                    <td>{r.mark.student.rollNo} {r.mark.student.name}</td>
                    <td>{r.mark.subject.name}</td>
                    <td>{r.mark.exam.name}</td>
                    <td>{describeAuditValue(r.oldValue) ?? "—"}</td>
                    <td>{describeAuditValue(r.newValue)}</td>
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
