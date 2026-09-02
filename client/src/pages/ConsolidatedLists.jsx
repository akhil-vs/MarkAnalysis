import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, download } from "../api.js";
import { ExamSelect } from "../components/AnalysisPanels.jsx";
import { EmptyNote, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";

export default function ConsolidatedLists() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState(params.get("examId") || "");
  const [selectedId, setSelectedId] = useState(params.get("class") || "");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function loadStatus(id) {
    const res = await api(`/api/exports/consolidated${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  async function loadPreview(classId, id = examId) {
    if (!classId) {
      setPreview(null);
      return;
    }
    const res = await api(`/api/exports/consolidated/${classId}?examId=${id}&format=json`);
    setPreview(res);
  }

  useEffect(() => {
    loadStatus(examId).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedId && examId) {
      loadPreview(selectedId, examId).catch((e) => setError(e.message));
    }
  }, [selectedId, examId]);

  function onExam(id) {
    setExamId(id);
    setPreview(null);
    const next = new URLSearchParams(params);
    next.set("examId", id);
    setParams(next, { replace: true });
    loadStatus(id).catch((e) => setError(e.message));
  }

  function selectClass(id) {
    setSelectedId(id);
    const next = new URLSearchParams(params);
    if (examId) next.set("examId", examId);
    next.set("class", id);
    setParams(next, { replace: true });
  }

  async function generate(format) {
    if (!selectedId || !examId) return;
    setBusy(format);
    setError("");
    const stem = preview
      ? `CML-${preview.label}-${(preview.exam?.name || "exam").replace(/\s+/g, "_")}`
      : "consolidated-mark-list";
    try {
      await download(
        `/api/exports/consolidated/${selectedId}?examId=${examId}&format=${format}`,
        `${stem}.${format}`
      );
    } catch (e) {
      setError(e.message || "Download failed");
    } finally {
      setBusy("");
    }
  }

  if (!data && !error) return <p>Loading mark lists…</p>;
  if (data?.empty) return <p>No exam data yet.</p>;

  const classes = data?.classes || [];
  const selected = classes.find((c) => c.id === selectedId);

  return (
    <div>
      <PageHeader
        title="Consolidated mark lists"
        subtitle="After teachers enter and you approve marks, generate the official class list — every student, every subject, totals, grade, and rank."
        actions={data?.exams ? <ExamSelect exams={data.exams} value={examId} onChange={onExam} /> : null}
      />

      {error && <p className="text-clay-600 text-sm mb-3">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-700/60">Classes ready</div>
          <div className="font-serif text-3xl mt-1">{data?.readyCount ?? 0} / {classes.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-700/60">Working exam</div>
          <div className="font-serif text-2xl mt-1">{data?.examLabel || data?.exam?.name}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-700/60">How it works</div>
          <p className="text-sm text-ink-700/70 mt-1">
            Teachers enter registers, leadership approves, then generate Excel or PDF for a class.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-4" title="Classes">
          <div className="space-y-2">
            {classes.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => selectClass(cls.id)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 ${
                  selectedId === cls.id ? "border-clay-500 bg-[#fbf4ec]" : "border-ink-900/10 hover:border-clay-500"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-serif text-xl">{cls.label}</span>
                  <StatusPill ready={cls.ready} complete={cls.complete} drafts={cls.draftCount} />
                </div>
                <div className="text-[11px] text-ink-700/55 mt-1">
                  {cls.approvedSubjects}/{cls.totalSubjects} subjects approved
                  {cls.teacher ? ` · ${cls.teacher}` : ""} · {cls.studentCount} students
                </div>
                {cls.missingSubjects?.length > 0 && (
                  <div className="text-[11px] text-clay-600 mt-1">Missing: {cls.missingSubjects.join(", ")}</div>
                )}
              </button>
            ))}
            {!classes.length && <EmptyNote>No classes on roll.</EmptyNote>}
          </div>
        </Panel>

        <div className="lg:col-span-8">
          {!selected && <EmptyNote>Choose a class to preview its consolidated mark list.</EmptyNote>}
          {selected && preview && (
            <Panel
              title={`${preview.label} — ${preview.examLabel}`}
              action={
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={Boolean(busy)} onClick={() => generate("xlsx")}>
                    {busy === "xlsx" ? "Preparing…" : "Excel"}
                  </button>
                  <button className="btn-ghost" disabled={Boolean(busy)} onClick={() => generate("pdf")}>
                    {busy === "pdf" ? "Preparing…" : "PDF"}
                  </button>
                </div>
              }
            >
              {preview.ready ? (
                <p className="text-sm text-moss-600 mb-3">All subject registers are approved. This is the official list.</p>
              ) : (
                <p className="text-sm text-clay-600 mb-3">
                  You can still generate a preview. Blank cells are missing or still draft.
                  {preview.missingSubjects?.length ? ` Outstanding: ${preview.missingSubjects.join(", ")}.` : ""}
                  {" "}
                  <Link className="underline" to="/pending-uploads">Pending uploads</Link>
                  {" · "}
                  <Link className="underline" to="/marks">Mark register</Link>
                </p>
              )}

              <div className="overflow-x-auto">
                <PaginatedTable items={preview.students} pageSize={15} pageSizeOptions={[15, 25, 50]} empty="No students in this class.">
                  {(page) => (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Roll</th>
                          <th>Name</th>
                          {preview.subjects.map((s) => (
                            <th key={s.id} title={s.teacher || ""}>
                              {s.name}
                              <div className="font-normal text-[10px] text-ink-700/50">{s.maxMarks}</div>
                            </th>
                          ))}
                          <th>Total</th>
                          <th>%</th>
                          <th>Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.map((row) => (
                          <tr key={row.studentId}>
                            <td>{row.rank ?? "—"}</td>
                            <td>{row.rollNo}</td>
                            <td>
                              <Link className="underline" to={`/students/${row.studentId}`}>{row.name}</Link>
                            </td>
                            {preview.subjects.map((s) => {
                              const cell = row.bySubject[s.id];
                              if (!cell || cell.status === "MISSING") return <td key={s.id} className="text-ink-700/35">—</td>;
                              if (cell.status === "DRAFT") {
                                return (
                                  <td key={s.id} className="text-clay-600" title="Draft — not approved">
                                    {cell.marks}
                                  </td>
                                );
                              }
                              return <td key={s.id}>{cell.marks}</td>;
                            })}
                            <td>{row.total ?? "—"}</td>
                            <td>{row.percent ?? "—"}</td>
                            <td>{row.grade || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </PaginatedTable>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ ready, complete, drafts }) {
  if (ready) return <span className="text-[10px] uppercase tracking-wide text-moss-600">Ready</span>;
  if (complete && drafts) return <span className="text-[10px] uppercase tracking-wide text-clay-600">Drafts left</span>;
  return <span className="text-[10px] uppercase tracking-wide text-ink-700/50">In progress</span>;
}
