import { useEffect, useState } from "react";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { describeAuditValue } from "../lib/markCodes.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function auditSearchText(r) {
  return searchHaystack(
    r.changedBy?.name,
    r.mark?.student?.rollNo,
    r.mark?.student?.name,
    r.mark?.subject?.name,
    r.mark?.exam?.name,
    describeAuditValue(r.oldValue),
    describeAuditValue(r.newValue)
  );
}

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const table = useTableSearch(rows, { getSearchText: auditSearchText });

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
        <div className="p-3 border-b border-ink-900/10">
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search staff, student, or subject"
            matched={table.matched}
            total={table.total}
          />
        </div>
        <PaginatedTable
          items={table.filtered}
          resetKey={`${examId}:${table.resetKey}`}
          empty="No edits recorded for this exam yet."
        >
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
