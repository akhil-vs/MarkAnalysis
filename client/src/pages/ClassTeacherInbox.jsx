import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { Kpi, PageHeader } from "../components/Layout.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { LoadingState } from "../components/Spinner.jsx";
import { paths, NAV_TITLES } from "../lib/nav.js";
import { useAuth } from "../auth.jsx";

export default function ClassTeacherInbox() {
  const { classTeacherOf } = useAuth();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState(searchParams.get("examId") || "");
  const [error, setError] = useState("");

  async function load(id) {
    setError("");
    try {
      const res = await api(`/api/analytics/class-teacher-inbox${id ? `?examId=${id}` : ""}`);
      setData(res);
      if (res.exam) setExamId(res.exam.id);
    } catch (err) {
      setError(err.message || "Could not load class-teacher inbox");
    }
  }

  useEffect(() => {
    load(searchParams.get("examId") || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!classTeacherOf?.length) {
    return (
      <p className="text-sm text-ink-700/70">
        You are not assigned as a class teacher for any section. Ask the principal to set you as class teacher under Records → Classes.
      </p>
    );
  }

  if (error) return <LoadError message={error} />;
  if (!data) return <LoadingState label="Loading section papers…" />;

  if (data.empty && data.reason === "no-exams") {
    return <p>No exams yet.</p>;
  }

  const pending = (data.papers || []).filter((p) => p.pending);
  const awaiting = (data.papers || []).filter((p) => p.awaitingApproval && !p.pending);

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.classInbox}
        subtitle={
          data.exam
            ? `${data.exam.name} — papers still missing or waiting for approval in your sections`
            : "Pending papers for your class-teacher sections"
        }
        actions={
          <select className="field-filter" value={examId} onChange={(e) => load(e.target.value)}>
            {(data.exams || []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Kpi label="Your sections" value={data.sections?.length || classTeacherOf.length} />
        <Kpi label="Missing marks" value={data.pendingCount ?? pending.length} warn />
        <Kpi label="Awaiting approval" value={data.awaitingApprovalCount ?? awaiting.length} warn />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(data.sections || classTeacherOf).map((c) => (
          <Link
            key={c.id}
            className="btn-ghost text-xs"
            to={`/consolidated?examId=${examId}&classSectionId=${c.id}`}
          >
            {c.label || `${c.className}-${c.section}`} · CML
          </Link>
        ))}
      </div>

      {!papersList(data).length ? (
        <p className="text-sm text-ink-700/70 rounded-xl border border-ink-900/10 bg-white/50 p-4">
          All subject registers for your sections are complete and approved for this exam.
        </p>
      ) : (
        <ul className="space-y-2">
          {papersList(data).map((p) => (
            <li
              key={`${p.classSectionId}|${p.subjectId}|${p.teacherId}`}
              className="rounded-xl border border-ink-900/10 bg-white/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium text-ink-900">
                  {p.classLabel} · {p.subject}
                </div>
                <div className="text-xs text-ink-700/55">
                  {p.teacherName}
                  {p.pending
                    ? ` — ${p.missing || 0} mark${(p.missing || 0) === 1 ? "" : "s"} still missing`
                    : " — submitted, awaiting leadership approval"}
                </div>
              </div>
              <Link
                className="text-sm underline"
                to={paths.marks({
                  examId,
                  classSectionId: p.classSectionId,
                  subjectId: p.subjectId,
                })}
              >
                Open register
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function papersList(data) {
  return data.papers || [];
}
