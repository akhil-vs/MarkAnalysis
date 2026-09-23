import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { ExamSelect } from "../components/ExamSelect.jsx";
import { EmptyNote, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { BusyLabel, LoadingState } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { FieldError } from "../components/FieldError.jsx";
import { NAV_TITLES } from "../lib/nav.js";

const TABS = [
  { id: "calendar", label: "Exam calendar" },
  { id: "reports", label: "Report cards" },
  { id: "revals", label: "Revaluations" },
  { id: "packs", label: "Board packs" },
];

function subjectLabel(s) {
  if (!s) return "—";
  return s.className ? `${s.name} · ${s.className}` : s.name;
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "—";
  }
}

function fmtDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function TabBar({ tab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tab === t.id ? "btn-primary" : "btn-ghost"}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const emptyPaper = {
  subjectId: "",
  className: "",
  paperDate: "",
  startTime: "",
  endTime: "",
  venue: "",
  maxMarks: "",
  notes: "",
};

const emptyReval = {
  studentId: "",
  subjectId: "",
  reason: "",
  feePaid: false,
  classSectionId: "",
};

export default function BoardOps() {
  const toast = useToast();
  const [tab, setTab] = useState("calendar");
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const [papers, setPapers] = useState([]);
  const [paperForm, setPaperForm] = useState(emptyPaper);

  const [releases, setReleases] = useState([]);
  const [publishClassId, setPublishClassId] = useState("");

  const [revals, setRevals] = useState([]);
  const [revalForm, setRevalForm] = useState(emptyReval);
  const [students, setStudents] = useState([]);
  const [reviewDraft, setReviewDraft] = useState({});

  const [packs, setPacks] = useState([]);
  const [packLabel, setPackLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [examList, subjectList, classList] = await Promise.all([
          api("/api/exams"),
          api("/api/subjects"),
          api("/api/classes"),
        ]);
        if (cancelled) return;
        setExams(examList || []);
        setSubjects(subjectList || []);
        setClasses(classList || []);
        if (examList?.length) setExamId((prev) => prev || examList[0].id);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load board data");
          toast.error(err.message || "Could not load board data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const loadTabData = useCallback(async () => {
    if (!examId) return;
    setError("");
    try {
      if (tab === "calendar") {
        setPapers(await api(`/api/board/exam-papers?examId=${encodeURIComponent(examId)}`));
      } else if (tab === "reports") {
        setReleases(await api(`/api/board/report-cards?examId=${encodeURIComponent(examId)}`));
      } else if (tab === "revals") {
        setRevals(await api(`/api/board/revaluations?examId=${encodeURIComponent(examId)}`));
      } else if (tab === "packs") {
        setPacks(await api(`/api/board/packs?examId=${encodeURIComponent(examId)}`));
      }
    } catch (err) {
      setError(err.message || "Failed to load");
      toast.error(err.message || "Failed to load");
    }
  }, [examId, tab, toast]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  useEffect(() => {
    if (!revalForm.classSectionId) {
      setStudents([]);
      return undefined;
    }
    let cancelled = false;
    api(`/api/students?classSectionId=${encodeURIComponent(revalForm.classSectionId)}&pageSize=200`)
      .then((res) => {
        if (!cancelled) setStudents(res.items || res || []);
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [revalForm.classSectionId]);

  const classOptions = useMemo(
    () =>
      (classes || []).map((c) => ({
        id: c.id,
        label: c.label || `${c.className}${c.section ? `-${c.section}` : ""}`,
      })),
    [classes]
  );

  async function savePaper(e) {
    e.preventDefault();
    if (!examId || !paperForm.subjectId || !paperForm.paperDate) {
      setError("Exam, subject, and paper date are required");
      return;
    }
    setBusy("paper");
    setError("");
    try {
      await api("/api/board/exam-papers", {
        method: "PUT",
        body: {
          examId,
          subjectId: paperForm.subjectId,
          className: paperForm.className || null,
          paperDate: paperForm.paperDate,
          startTime: paperForm.startTime || null,
          endTime: paperForm.endTime || null,
          venue: paperForm.venue || null,
          maxMarks: paperForm.maxMarks !== "" ? Number(paperForm.maxMarks) : null,
          notes: paperForm.notes || null,
        },
      });
      setPaperForm(emptyPaper);
      toast.success("Paper schedule saved");
      await loadTabData();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Could not save paper");
    } finally {
      setBusy("");
    }
  }

  async function removePaper(id) {
    setBusy(`del-${id}`);
    try {
      await api(`/api/board/exam-papers/${id}`, { method: "DELETE" });
      toast.success("Paper removed");
      await loadTabData();
    } catch (err) {
      toast.error(err.message || "Could not delete");
    } finally {
      setBusy("");
    }
  }

  async function publishReport(classSectionId) {
    if (!examId || !classSectionId) return;
    setBusy(`pub-${classSectionId}`);
    try {
      await api("/api/board/report-cards/publish", {
        method: "POST",
        body: { examId, classSectionId },
      });
      toast.success("Report cards published");
      setPublishClassId("");
      await loadTabData();
    } catch (err) {
      toast.error(err.message || "Publish failed");
    } finally {
      setBusy("");
    }
  }

  async function signOffReport(classSectionId) {
    setBusy(`sign-${classSectionId}`);
    try {
      await api("/api/board/report-cards/sign-off", {
        method: "POST",
        body: { examId, classSectionId },
      });
      toast.success("Report cards signed off");
      await loadTabData();
    } catch (err) {
      toast.error(err.message || "Sign-off failed");
    } finally {
      setBusy("");
    }
  }

  async function notifyParents(classSectionId) {
    setBusy(`notify-${classSectionId}`);
    try {
      const res = await api("/api/board/report-cards/notify-parents", {
        method: "POST",
        body: { examId, classSectionId },
      });
      toast.success(`Parents notified (${res.queued || 0} emailed, ${res.skipped || 0} skipped)`);
      await loadTabData();
    } catch (err) {
      toast.error(err.message || "Notify failed");
    } finally {
      setBusy("");
    }
  }

  async function createReval(e) {
    e.preventDefault();
    if (!examId || !revalForm.studentId || !revalForm.subjectId) {
      setError("Exam, student, and subject are required");
      return;
    }
    setBusy("reval");
    setError("");
    try {
      await api("/api/board/revaluations", {
        method: "POST",
        body: {
          examId,
          studentId: revalForm.studentId,
          subjectId: revalForm.subjectId,
          reason: revalForm.reason || null,
          feePaid: Boolean(revalForm.feePaid),
        },
      });
      setRevalForm(emptyReval);
      toast.success("Revaluation request created");
      await loadTabData();
    } catch (err) {
      setError(err.message);
      toast.error(err.message || "Could not create request");
    } finally {
      setBusy("");
    }
  }

  async function reviewReval(id) {
    const draft = reviewDraft[id] || {};
    setBusy(`review-${id}`);
    try {
      await api(`/api/board/revaluations/${id}`, {
        method: "PATCH",
        body: {
          status: draft.status || undefined,
          reviewNotes: draft.reviewNotes ?? undefined,
          revisedMarks: draft.revisedMarks !== "" && draft.revisedMarks != null ? draft.revisedMarks : undefined,
        },
      });
      toast.success("Revaluation updated");
      setReviewDraft((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await loadTabData();
    } catch (err) {
      toast.error(err.message || "Review failed");
    } finally {
      setBusy("");
    }
  }

  async function createPack() {
    if (!examId) return;
    setBusy("pack");
    try {
      await api("/api/board/packs", {
        method: "POST",
        body: { examId, label: packLabel || null },
      });
      setPackLabel("");
      toast.success("Board pack created");
      await loadTabData();
    } catch (err) {
      toast.error(err.message || "Could not create pack");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <LoadingState label="Loading board ops…" />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={NAV_TITLES.boardOps}
        subtitle="Exam paper calendar, report-card release, revaluations, and board packs"
        actions={
          <ExamSelect
            exams={exams}
            value={examId}
            onChange={(id) => {
              setExamId(id);
              setError("");
            }}
          />
        }
      />

      <TabBar tab={tab} onChange={setTab} />
      {error && <FieldError message={error} />}

      {!examId ? (
        <EmptyNote>Add an exam under Records before using board operations.</EmptyNote>
      ) : tab === "calendar" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Scheduled papers">
            {!papers.length ? (
              <EmptyNote>No papers scheduled for this exam yet.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Subject</th>
                      <th>Time</th>
                      <th>Venue</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {papers.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.paperDate)}</td>
                        <td>{subjectLabel(p.subject)}</td>
                        <td className="whitespace-nowrap text-ink-700/80">
                          {[p.startTime, p.endTime].filter(Boolean).join(" – ") || "—"}
                        </td>
                        <td>{p.venue || "—"}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            disabled={busy === `del-${p.id}`}
                            onClick={() => removePaper(p.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <form className="card p-4 sm:p-5 space-y-3" onSubmit={savePaper}>
            <h3 className="font-serif text-lg">Schedule a paper</h3>
            <p className="text-xs text-ink-700/55">
              Edits here use the same paper schedule as{" "}
              <Link className="underline underline-offset-2" to="/manage?tab=Exams">
                Records → Exams
              </Link>
              . Use this form for venues and board calendar detail; use Records to set dates for a whole class at once.
            </p>
            <div>
              <label className="label">Subject</label>
              <select
                className="field"
                required
                value={paperForm.subjectId}
                onChange={(e) => setPaperForm({ ...paperForm, subjectId: e.target.value })}
              >
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {subjectLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Class name (optional)</label>
              <input
                className="field"
                value={paperForm.className}
                onChange={(e) => setPaperForm({ ...paperForm, className: e.target.value })}
                placeholder="e.g. 10"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="field"
                  required
                  value={paperForm.paperDate}
                  onChange={(e) => setPaperForm({ ...paperForm, paperDate: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Start</label>
                <input
                  type="time"
                  className="field"
                  value={paperForm.startTime}
                  onChange={(e) => setPaperForm({ ...paperForm, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="label">End</label>
                <input
                  type="time"
                  className="field"
                  value={paperForm.endTime}
                  onChange={(e) => setPaperForm({ ...paperForm, endTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Venue</label>
                <input
                  className="field"
                  value={paperForm.venue}
                  onChange={(e) => setPaperForm({ ...paperForm, venue: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Max marks</label>
                <input
                  type="number"
                  className="field"
                  min="0"
                  value={paperForm.maxMarks}
                  onChange={(e) => setPaperForm({ ...paperForm, maxMarks: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <input
                className="field"
                value={paperForm.notes}
                onChange={(e) => setPaperForm({ ...paperForm, notes: e.target.value })}
              />
            </div>
            <button className="btn-accent" disabled={busy === "paper"}>
              <BusyLabel busy={busy === "paper"} idle="Save schedule" busyText="Saving…" />
            </button>
          </form>
        </div>
      ) : tab === "reports" ? (
        <div className="space-y-4">
          <Panel
            title="Publish a class"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="field-filter"
                  value={publishClassId}
                  onChange={(e) => setPublishClassId(e.target.value)}
                >
                  <option value="">Select class</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-accent"
                  disabled={!publishClassId || busy.startsWith("pub-")}
                  onClick={() => publishReport(publishClassId)}
                >
                  Publish
                </button>
              </div>
            }
          >
            {!releases.length ? (
              <EmptyNote>No report-card releases for this exam yet. Publish a class to start.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Status</th>
                      <th>Published</th>
                      <th>Signed off</th>
                      <th>Parents</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((r) => (
                      <tr key={r.id}>
                        <td>{r.classLabel || "—"}</td>
                        <td>{r.status}</td>
                        <td>{fmtDateTime(r.publishedAt)}</td>
                        <td>
                          {r.signedOffBy?.name
                            ? `${r.signedOffBy.name} · ${fmtDateTime(r.signedOffAt)}`
                            : fmtDateTime(r.signedOffAt)}
                        </td>
                        <td>{fmtDateTime(r.parentsNotifiedAt)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1 justify-end">
                            <button
                              type="button"
                              className="btn-ghost text-xs"
                              disabled={busy === `pub-${r.classSectionId}`}
                              onClick={() => publishReport(r.classSectionId)}
                            >
                              Publish
                            </button>
                            <button
                              type="button"
                              className="btn-ghost text-xs"
                              disabled={busy === `sign-${r.classSectionId}`}
                              onClick={() => signOffReport(r.classSectionId)}
                            >
                              Sign off
                            </button>
                            <button
                              type="button"
                              className="btn-accent text-xs"
                              disabled={busy === `notify-${r.classSectionId}`}
                              onClick={() => notifyParents(r.classSectionId)}
                            >
                              Notify parents
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : tab === "revals" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Requests">
            {!revals.length ? (
              <EmptyNote>No revaluation requests for this exam.</EmptyNote>
            ) : (
              <div className="space-y-3">
                {revals.map((r) => {
                  const draft = reviewDraft[r.id] || {
                    status: r.status,
                    reviewNotes: r.reviewNotes || "",
                    revisedMarks: r.revisedMarks != null ? String(r.revisedMarks) : "",
                  };
                  return (
                    <div key={r.id} className="rounded-lg border border-ink-900/10 bg-white/70 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm">
                            {r.student?.rollNo} {r.student?.name}
                          </div>
                          <div className="text-xs text-ink-700/65">
                            {r.subject?.name} · {r.status}
                            {r.originalMarks != null ? ` · original ${r.originalMarks}` : ""}
                          </div>
                          {r.reason && <p className="mt-1 text-xs text-ink-700/70">{r.reason}</p>}
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-2">
                        <select
                          className="field"
                          value={draft.status}
                          onChange={(e) =>
                            setReviewDraft({
                              ...reviewDraft,
                              [r.id]: { ...draft, status: e.target.value },
                            })
                          }
                        >
                          {["PENDING", "APPROVED", "REJECTED", "COMPLETED"].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <input
                          className="field"
                          placeholder="Revised marks"
                          value={draft.revisedMarks}
                          onChange={(e) =>
                            setReviewDraft({
                              ...reviewDraft,
                              [r.id]: { ...draft, revisedMarks: e.target.value },
                            })
                          }
                        />
                        <input
                          className="field"
                          placeholder="Review notes"
                          value={draft.reviewNotes}
                          onChange={(e) =>
                            setReviewDraft({
                              ...reviewDraft,
                              [r.id]: { ...draft, reviewNotes: e.target.value },
                            })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-accent text-xs"
                        disabled={busy === `review-${r.id}`}
                        onClick={() => reviewReval(r.id)}
                      >
                        Save review
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <form className="card p-4 sm:p-5 space-y-3" onSubmit={createReval}>
            <h3 className="font-serif text-lg">New request</h3>
            <div>
              <label className="label">Class</label>
              <select
                className="field"
                required
                value={revalForm.classSectionId}
                onChange={(e) =>
                  setRevalForm({ ...revalForm, classSectionId: e.target.value, studentId: "" })
                }
              >
                <option value="">Select class</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Student</label>
              <select
                className="field"
                required
                value={revalForm.studentId}
                onChange={(e) => setRevalForm({ ...revalForm, studentId: e.target.value })}
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.rollNo} · {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Subject</label>
              <select
                className="field"
                required
                value={revalForm.subjectId}
                onChange={(e) => setRevalForm({ ...revalForm, subjectId: e.target.value })}
              >
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {subjectLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Reason</label>
              <textarea
                className="field"
                rows={3}
                value={revalForm.reason}
                onChange={(e) => setRevalForm({ ...revalForm, reason: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={revalForm.feePaid}
                onChange={(e) => setRevalForm({ ...revalForm, feePaid: e.target.checked })}
              />
              Fee paid
            </label>
            <button className="btn-accent" disabled={busy === "reval"}>
              <BusyLabel busy={busy === "reval"} idle="Create request" busyText="Saving…" />
            </button>
          </form>
        </div>
      ) : (
        <Panel
          title="Board packs"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="field-filter min-w-[10rem]"
                placeholder="Label (optional)"
                value={packLabel}
                onChange={(e) => setPackLabel(e.target.value)}
              />
              <button type="button" className="btn-accent" disabled={busy === "pack"} onClick={createPack}>
                <BusyLabel busy={busy === "pack"} idle="Create pack" busyText="Creating…" />
              </button>
            </div>
          }
        >
          {!packs.length ? (
            <EmptyNote>No board packs for this exam yet.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Label</th>
                    <th>Status</th>
                    <th>By</th>
                    <th>Papers / marks</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDateTime(p.createdAt)}</td>
                      <td>{p.label || "—"}</td>
                      <td>{p.status}</td>
                      <td>{p.createdBy?.name || "—"}</td>
                      <td className="text-ink-700/75 text-xs">
                        {p.manifest?.subjectPaperScheduleCount ?? "—"} papers ·{" "}
                        {p.manifest?.approvedMarkCount ?? "—"} approved marks
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
