import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { ExamSelect, TeacherCompareTable, YearComparison } from "../components/AnalysisPanels.jsx";
import { BarTrack, Metric, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";

function statusTone(status) {
  if (status === "APPROVED") return "text-moss-700";
  if (status === "AWAITING_APPROVAL") return "text-clay-600";
  if (status === "PARTIAL") return "text-clay-600";
  return "text-ink-700/50";
}

export default function TeacherAnalytics() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(eid) {
    const res = await api(`/api/analytics/staff/${id}${eid ? `?examId=${eid}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, [id]);

  if (!data) return <p>Loading teacher…</p>;
  if (data.empty) return <p>No data for this teacher yet.</p>;

  return (
    <div>
      <PageHeader
        title={data.teacher.name}
        subtitle={`${data.exam.name} · ${data.exam.academicYear || ""}`}
        actions={<ExamSelect exams={data.exams} value={examId} onChange={load} />}
      />

      {data.kpis?.provisional && (
        <p className="mb-4 text-sm text-clay-700 bg-[#fbf4ec] border border-clay-500/20 rounded-lg px-3 py-2">
          Averages below include draft marks that still need leadership approval on the mark register.
        </p>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric
          label={data.kpis?.provisional ? "Average (draft)" : "Average"}
          value={data.kpis.average != null ? `${data.kpis.average}%` : "—"}
        />
        <Metric label="Pass rate" value={data.kpis.passRate != null ? `${data.kpis.passRate}%` : "—"} />
        <Metric label="Sections" value={data.kpis.sections} />
        <Metric
          label="Awaiting approval"
          value={data.kpis.awaitingApproval ?? 0}
          tone={data.kpis.awaitingApproval ? "alert" : undefined}
        />
      </div>

      <Panel title="Registers" className="mb-4">
        <div className="grid sm:grid-cols-2 gap-3">
          {(data.registers || []).map((r) => (
            <Link
              key={r.id}
              to={`/marks?classSectionId=${r.classSectionId}&subjectId=${r.subjectId}&examId=${examId}`}
              className="rounded-xl border border-ink-900/10 p-4 hover:border-clay-500"
            >
              <div className="flex justify-between gap-2">
                <div>
                  <div className="font-serif text-xl">{r.classLabel}</div>
                  <div className="text-xs text-ink-700/55">{r.subject}</div>
                  <div className={`text-[11px] mt-1 ${statusTone(r.status)}`}>
                    {r.statusLabel || r.status}
                    {r.provisional ? " · provisional" : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-2xl">{r.average ?? "—"}</div>
                  <div className="text-[11px] text-ink-700/50">
                    {r.approved ?? 0} approved · {r.draft ?? 0} draft
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <BarTrack value={r.expected ? ((r.uploaded || 0) / r.expected) * 100 : 0} />
              </div>
            </Link>
          ))}
        </div>
      </Panel>

      {(data.peerCompare || []).map((block) => (
        <Panel
          key={block.subject}
          className="mb-4"
          title={`${block.subject} — same subject, other teachers`}
          action={
            <Link className="text-xs underline text-ink-700/60" to={`/analysis/compare?tab=teachers&subject=${encodeURIComponent(block.subject)}`}>
              Full comparison
            </Link>
          }
        >
          <TeacherCompareTable rows={block.teachers} />
          {block.spread != null && (
            <p className="text-xs text-ink-700/60 mt-2">Gap between highest and lowest teacher average: {block.spread} points.</p>
          )}
        </Panel>
      ))}

      <YearComparison series={data.yearComparison} title="This teacher versus previous years" />
    </div>
  );
}
