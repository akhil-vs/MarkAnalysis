import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Kpi, PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";

export default function PendingUploads() {
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(id) {
    const res = await api(`/api/analytics/pending-uploads${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, []);

  if (!data) return <p>Loading upload status…</p>;
  if (data.empty) return <p>No exams yet.</p>;

  const pending = (data.teachers || []).filter((t) => t.pending);
  const awaiting = (data.teachers || []).filter((t) => t.awaitingApproval && !t.pending);

  return (
    <div>
      <PageHeader
        title="Pending mark uploads"
        subtitle={`${data.exam.name} — missing registers and drafts waiting for approval`}
        actions={
          <select className="field w-auto" value={examId} onChange={(e) => load(e.target.value)}>
            {(data.exams || []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Teachers pending" value={data.pendingTeacherCount} warn={data.pendingTeacherCount > 0} />
        <Kpi
          label="Awaiting approval"
          value={data.awaitingApprovalTeacherCount ?? 0}
          warn={(data.awaitingApprovalTeacherCount ?? 0) > 0}
        />
        <Kpi label="Fully approved" value={data.completeTeacherCount} />
        <Kpi label="Assigned teachers" value={(data.teachers || []).length} />
      </div>

      {pending.length === 0 && awaiting.length === 0 ? (
        <div className="card p-5 text-ink-700/70">
          Every assigned teacher has uploaded and leadership has approved marks for this exam.{" "}
          <Link className="underline" to={`/consolidated?examId=${examId}`}>Generate consolidated mark lists</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {awaiting.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-serif text-xl">Entered — awaiting your approval</h2>
              <p className="text-sm text-ink-700/60">
                Teachers have saved these registers as draft. Open the mark register and click Approve so they appear in school analytics and consolidated lists.
              </p>
              {awaiting.map((t) => (
                <TeacherCard key={`await-${t.teacherId}`} teacher={t} mode="awaiting" examId={examId} />
              ))}
            </section>
          )}
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-serif text-xl">Still missing marks</h2>
              {pending.map((t) => (
                <TeacherCard key={`pend-${t.teacherId}`} teacher={t} mode="pending" examId={examId} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TeacherCard({ teacher: t, mode, examId }) {
  const rows =
    mode === "awaiting"
      ? t.assignments.filter((a) => (a.draft ?? 0) > 0 && (a.approved ?? 0) < a.expected)
      : t.assignments.filter((a) => a.missing > 0);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-serif text-xl">{t.name}</div>
          <div className="text-xs text-ink-700/60">{t.email}</div>
        </div>
        <div className="text-sm text-clay-600">
          {mode === "awaiting"
            ? `${t.awaitingApprovalAssignments} register${t.awaitingApprovalAssignments === 1 ? "" : "s"} awaiting approval`
            : `${t.missingAssignments} register${t.missingAssignments === 1 ? "" : "s"} outstanding`}
        </div>
      </div>
      <PaginatedTable items={rows} pageSize={5} pageSizeOptions={[5, 10, 25]} empty="No rows.">
        {(page) => (
          <table className="table mt-3">
            <thead>
              <tr>
                <th>Class</th>
                <th>Subject</th>
                <th>Entered</th>
                <th>Approved</th>
                <th>Draft</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {page.map((a) => (
                <tr key={`${a.classSectionId}-${a.subject}`}>
                  <td>{a.classLabel}</td>
                  <td>{a.subject}</td>
                  <td>{a.uploaded} / {a.expected}</td>
                  <td>{a.approved ?? 0}</td>
                  <td>{a.draft ?? 0}</td>
                  <td>
                    <Link
                      className="underline text-xs"
                      to={`/marks?classSectionId=${a.classSectionId}&examId=${examId}`}
                    >
                      Open register
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PaginatedTable>
    </div>
  );
}
