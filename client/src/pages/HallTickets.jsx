import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, download } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ExamSelect } from "../components/ExamSelect.jsx";
import { EmptyNote, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { BusyLabel, Spinner } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { NAV_TITLES } from "../lib/nav.js";
import { isLeadership } from "../lib/roles.js";

const DEFAULT_INSTRUCTIONS =
  "Bring this hall ticket and your school ID to every paper. Electronic devices are not allowed in the examination hall. Follow the invigilator’s instructions at all times.";

function emptyForm() {
  return {
    title: "",
    instructions: DEFAULT_INSTRUCTIONS,
    defaultVenue: "",
    examCentre: "",
    includePhoto: true,
    internalNotes: "",
  };
}

function formFromIssue(issue, defaults) {
  if (!issue) {
    return {
      ...emptyForm(),
      title: defaults?.title || "",
      instructions: defaults?.instructions || DEFAULT_INSTRUCTIONS,
    };
  }
  return {
    title: issue.title || defaults?.title || "",
    instructions: issue.instructions || defaults?.instructions || DEFAULT_INSTRUCTIONS,
    defaultVenue: issue.defaultVenue || "",
    examCentre: issue.examCentre || "",
    includePhoto: issue.includePhoto !== false,
    internalNotes: issue.internalNotes || "",
  };
}

function paperHasDateAndTime(paper) {
  return Boolean(paper?.paperDate) && Boolean(String(paper?.startTime || "").trim());
}

function papersScheduleComplete(papers) {
  const list = papers || [];
  return list.length > 0 && list.every(paperHasDateAndTime);
}

const SCHEDULE_INCOMPLETE_HINT =
  "Set a date and start time for every paper under Records → Exams before downloading.";

export default function HallTickets() {
  const toast = useToast();
  const { user } = useAuth();
  const canEdit = isLeadership(user?.role);
  const [params, setParams] = useSearchParams();
  const [examId, setExamId] = useState(params.get("examId") || "");
  const [exams, setExams] = useState([]);
  const [selectedClassName, setSelectedClassName] = useState(params.get("className") || "");
  const [selectedId, setSelectedId] = useState(params.get("classSectionId") || "");
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const classGroups = useMemo(() => {
    const byName = new Map();
    for (const section of status?.classes || []) {
      if (!byName.has(section.className)) {
        byName.set(section.className, {
          className: section.className,
          divisions: [],
          studentCount: 0,
          issuedCount: 0,
        });
      }
      const group = byName.get(section.className);
      group.divisions.push(section);
      group.studentCount += section.studentCount || 0;
      if (section.issue) group.issuedCount += 1;
    }
    return [...byName.values()];
  }, [status]);

  const selectedGroup = classGroups.find((g) => g.className === selectedClassName) || null;
  const selectedSection =
    (status?.classes || []).find((c) => c.id === selectedId) ||
    selectedGroup?.divisions.find((d) => d.id === selectedId) ||
    null;

  const canDownloadPdf = useMemo(() => {
    if (preview) {
      if (typeof preview.canDownloadPdf === "boolean") return preview.canDownloadPdf;
      if (typeof preview.scheduleComplete === "boolean") return preview.scheduleComplete;
      return papersScheduleComplete(preview.papers);
    }
    return Boolean(selectedSection?.scheduleComplete);
  }, [preview, selectedSection]);

  const scheduleIncompleteMessage = canDownloadPdf ? "" : SCHEDULE_INCOMPLETE_HINT;

  function syncParams({
    exam = examId,
    className = selectedClassName,
    classSectionId = selectedId,
  } = {}) {
    const next = new URLSearchParams(params);
    if (exam) next.set("examId", exam);
    else next.delete("examId");
    if (className) next.set("className", className);
    else next.delete("className");
    if (classSectionId) next.set("classSectionId", classSectionId);
    else next.delete("classSectionId");
    setParams(next, { replace: true });
  }

  async function loadStatus(id = examId) {
    setLoadingStatus(true);
    setError("");
    try {
      const res = await api(`/api/hall-tickets${id ? `?examId=${encodeURIComponent(id)}` : ""}`);
      setStatus(res);
      if (id) setExamId(id);
    } finally {
      setLoadingStatus(false);
    }
  }

  async function loadPreview(classSectionId = selectedId, id = examId) {
    if (!classSectionId || !id) {
      setPreview(null);
      setLoadingPreview(false);
      return;
    }
    setLoadingPreview(true);
    setError("");
    try {
      const res = await api(
        `/api/hall-tickets/preview?examId=${encodeURIComponent(id)}&classSectionId=${encodeURIComponent(classSectionId)}`
      );
      setPreview(res);
      setForm(formFromIssue(res.issue, res.defaults));
    } catch (e) {
      setPreview(null);
      throw e;
    } finally {
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/exams");
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.items || [];
        setExams(list);
        const latest = list.length ? list[list.length - 1] : null;
        const initial = examId || latest?.id || "";
        if (initial && initial !== examId) {
          setExamId(initial);
          const next = new URLSearchParams(params);
          next.set("examId", initial);
          setParams(next, { replace: true });
        }
        await loadStatus(initial);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedId && examId) {
      loadPreview(selectedId, examId).catch((e) => setError(e.message));
    } else {
      setPreview(null);
    }
  }, [selectedId, examId]);

  function onExam(id) {
    setExamId(id);
    setPreview(null);
    syncParams({ exam: id });
    loadStatus(id).catch((e) => setError(e.message));
  }

  function selectClassGroup(className) {
    setSelectedClassName(className);
    setSelectedId("");
    setPreview(null);
    syncParams({ className, classSectionId: "" });
  }

  function selectDivision(id) {
    const cls = (status?.classes || []).find((c) => c.id === id);
    setSelectedId(id);
    if (cls?.className) setSelectedClassName(cls.className);
    syncParams({ className: cls?.className || selectedClassName, classSectionId: id });
  }

  async function saveIssue() {
    if (!canEdit || !examId || !selectedId) return;
    setBusy("save");
    setError("");
    try {
      const body = {
        examId,
        classSectionId: selectedId,
        title: form.title.trim() || null,
        instructions: form.instructions.trim() || null,
        defaultVenue: form.defaultVenue.trim() || null,
        examCentre: form.examCentre.trim() || null,
        includePhoto: form.includePhoto,
        internalNotes: form.internalNotes.trim() || null,
      };
      if (preview?.issue?.id) {
        await api(`/api/hall-tickets/${preview.issue.id}`, { method: "PATCH", body });
        toast.success("Hall ticket settings updated.");
      } else {
        await api("/api/hall-tickets", { method: "POST", body });
        toast.success("Hall tickets created for this class.");
      }
      await Promise.all([loadStatus(examId), loadPreview(selectedId, examId)]);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  }

  async function removeIssue() {
    if (!canEdit || !preview?.issue?.id) return;
    if (!window.confirm("Remove saved hall ticket settings for this class? You can still download a fresh PDF from student and exam data.")) {
      return;
    }
    setBusy("delete");
    try {
      await api(`/api/hall-tickets/${preview.issue.id}`, { method: "DELETE" });
      toast.success("Hall ticket batch removed.");
      await Promise.all([loadStatus(examId), loadPreview(selectedId, examId)]);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  }

  async function downloadPdf() {
    if (!examId || !selectedId || !canDownloadPdf) return;
    setBusy("pdf");
    try {
      await download(
        `/api/hall-tickets/pdf?examId=${encodeURIComponent(examId)}&classSectionId=${encodeURIComponent(selectedId)}`,
        `hall-tickets-${selectedSection?.label || selectedId}.pdf`
      );
      toast.success("Hall tickets PDF downloaded.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={NAV_TITLES.hallTickets}
        subtitle={
          canEdit
            ? "Create and adjust class hall tickets, then print five per A4 sheet with student photos."
            : "View and download class hall tickets for your sections (five per A4 sheet)."
        }
      />

      <Panel title="Exam">
        <ExamSelect exams={exams} value={examId} onChange={onExam} />
      </Panel>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loadingStatus ? (
        <div className="card flex min-h-[10rem] items-center justify-center gap-2 text-sm text-ink-700">
          <Spinner className="h-4 w-4" label="" />
          <span>Loading classes…</span>
        </div>
      ) : !examId ? (
        <EmptyNote>Select an exam to generate hall tickets.</EmptyNote>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <Panel title="Classes">
            <div className="space-y-2">
              {classGroups.map((group) => (
                <button
                  key={group.className}
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selectedClassName === group.className
                      ? "border-ink-900 bg-ink-900 text-cream"
                      : "border-ink-900/10 bg-white hover:border-ink-900/25"
                  }`}
                  onClick={() => selectClassGroup(group.className)}
                >
                  <div className="font-medium">Class {group.className}</div>
                  <div className={`text-xs ${selectedClassName === group.className ? "text-cream/70" : "text-ink-700/60"}`}>
                    {group.divisions.length} division{group.divisions.length === 1 ? "" : "s"} · {group.studentCount} students
                    {group.issuedCount ? ` · ${group.issuedCount} saved` : ""}
                  </div>
                </button>
              ))}
              {!classGroups.length && <EmptyNote>No classes available.</EmptyNote>}
            </div>
          </Panel>

          <div className="space-y-4">
            {selectedGroup && (
              <Panel title={`Divisions · Class ${selectedGroup.className}`}>
                <div className="flex flex-wrap gap-2">
                  {selectedGroup.divisions.map((div) => (
                    <div key={div.id} className="flex items-stretch gap-1">
                      <button
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          selectedId === div.id
                            ? "border-ink-900 bg-ink-900 text-cream"
                            : "border-ink-900/10 bg-white hover:border-ink-900/25"
                        }`}
                        onClick={() => selectDivision(div.id)}
                      >
                        <span className="font-medium">{div.label}</span>
                        <span className={`ml-2 text-xs ${selectedId === div.id ? "text-cream/70" : "text-ink-700/60"}`}>
                          {div.studentCount} · {div.issue ? "Saved" : "New"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn-ghost rounded-lg px-2.5 text-xs"
                        title={
                          div.scheduleComplete
                            ? `Download PDF for ${div.label}`
                            : `${div.label}: ${SCHEDULE_INCOMPLETE_HINT}`
                        }
                        disabled={Boolean(busy) || !examId || !div.scheduleComplete}
                        onClick={async () => {
                          if (!div.scheduleComplete) return;
                          selectDivision(div.id);
                          setBusy("pdf");
                          try {
                            await download(
                              `/api/hall-tickets/pdf?examId=${encodeURIComponent(examId)}&classSectionId=${encodeURIComponent(div.id)}`,
                              `hall-tickets-${div.label}.pdf`
                            );
                            toast.success(`Downloaded hall tickets for ${div.label}.`);
                          } catch (e) {
                            toast.error(e.message);
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        PDF
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {!selectedId && selectedGroup && (
              <EmptyNote>Pick a division to create or view hall tickets.</EmptyNote>
            )}

            {selectedId && (
              <Panel
                title={selectedSection?.label || "Hall tickets"}
                action={
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={Boolean(busy) || loadingPreview || !preview || !canDownloadPdf}
                    title={scheduleIncompleteMessage || undefined}
                    onClick={downloadPdf}
                  >
                    <BusyLabel busy={busy === "pdf"} idle="Download PDF (5 / A4)" busyText="Preparing…" />
                  </button>
                }
              >
                {loadingPreview ? (
                  <div className="flex min-h-[8rem] items-center justify-center gap-2 text-sm text-ink-700">
                    <Spinner className="h-4 w-4" label="" />
                    <span>Loading preview…</span>
                  </div>
                ) : preview ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-900/10 bg-cream/50 px-3 py-3">
                      <div className="text-sm text-ink-700/80">
                        <span className="font-medium text-ink-900">Preview ready</span>
                        {" · "}
                        {preview.studentCount} student{preview.studentCount === 1 ? "" : "s"}
                        {" · "}
                        {preview.paperCount} paper{preview.paperCount === 1 ? "" : "s"}
                        {preview.issue ? " · batch saved" : " · using defaults until you save a batch"}
                        {!canDownloadPdf ? (
                          <p className="mt-1 text-xs text-amber-800">{SCHEDULE_INCOMPLETE_HINT}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={Boolean(busy) || !canDownloadPdf}
                        title={scheduleIncompleteMessage || undefined}
                        onClick={downloadPdf}
                      >
                        <BusyLabel busy={busy === "pdf"} idle="Download PDF (5 / A4)" busyText="Preparing…" />
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-ink-900/10 bg-cream/40 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-ink-700/50">Students</div>
                        <div className="font-serif text-xl">{preview.studentCount}</div>
                      </div>
                      <div className="rounded-lg border border-ink-900/10 bg-cream/40 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-ink-700/50">With photo</div>
                        <div className="font-serif text-xl">{preview.photoCount}</div>
                      </div>
                      <div className="rounded-lg border border-ink-900/10 bg-cream/40 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-ink-700/50">Papers</div>
                        <div className="font-serif text-xl">{preview.paperCount}</div>
                      </div>
                    </div>

                    {canEdit ? (
                      <form
                        className="space-y-3 rounded-lg border border-ink-900/10 p-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveIssue();
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-serif text-lg">
                            {preview.issue ? "Modify hall ticket settings" : "Create hall ticket batch"}
                          </h3>
                          {preview.issue && (
                            <span className="text-xs text-ink-700/50">
                              Saved · last updated {new Date(preview.issue.updatedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block text-sm">
                            <span className="mb-1 block text-ink-700/70">Title on ticket</span>
                            <input
                              className="field"
                              value={form.title}
                              onChange={(e) => setForm({ ...form, title: e.target.value })}
                              placeholder={preview.defaults?.title}
                              disabled={Boolean(busy)}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-ink-700/70">Exam centre</span>
                            <input
                              className="field"
                              value={form.examCentre}
                              onChange={(e) => setForm({ ...form, examCentre: e.target.value })}
                              disabled={Boolean(busy)}
                            />
                          </label>
                          <label className="block text-sm">
                            <span className="mb-1 block text-ink-700/70">Default venue</span>
                            <input
                              className="field"
                              value={form.defaultVenue}
                              onChange={(e) => setForm({ ...form, defaultVenue: e.target.value })}
                              placeholder="Used when a paper has no venue"
                              disabled={Boolean(busy)}
                            />
                          </label>
                          <label className="flex items-center gap-2 pt-6 text-sm">
                            <input
                              type="checkbox"
                              checked={form.includePhoto}
                              onChange={(e) => setForm({ ...form, includePhoto: e.target.checked })}
                              disabled={Boolean(busy)}
                            />
                            Print student photos when available
                          </label>
                        </div>
                        <label className="block text-sm">
                          <span className="mb-1 block text-ink-700/70">Instructions on ticket</span>
                          <textarea
                            className="field min-h-[4.5rem]"
                            value={form.instructions}
                            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                            disabled={Boolean(busy)}
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-ink-700/70">Internal notes (not printed)</span>
                          <textarea
                            className="field min-h-[3rem]"
                            value={form.internalNotes}
                            onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
                            disabled={Boolean(busy)}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" className="btn-primary" disabled={Boolean(busy)}>
                            <BusyLabel
                              busy={busy === "save"}
                              idle={preview.issue ? "Save changes" : "Create hall tickets"}
                              busyText="Saving…"
                            />
                          </button>
                          {preview.issue && (
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={Boolean(busy)}
                              onClick={removeIssue}
                            >
                              <BusyLabel busy={busy === "delete"} idle="Remove batch" busyText="Removing…" />
                            </button>
                          )}
                        </div>
                      </form>
                    ) : (
                      <div className="rounded-lg border border-ink-900/10 bg-cream/30 p-4 text-sm text-ink-700">
                        <div className="font-medium text-ink-900">
                          {preview.issue?.title || preview.defaults?.title}
                        </div>
                        <p className="mt-1 text-ink-700/70">
                          {preview.issue?.instructions || preview.defaults?.instructions}
                        </p>
                        {(preview.issue?.examCentre || preview.issue?.defaultVenue) && (
                          <p className="mt-2 text-xs text-ink-700/60">
                            {preview.issue.examCentre ? `Centre: ${preview.issue.examCentre}` : ""}
                            {preview.issue.examCentre && preview.issue.defaultVenue ? " · " : ""}
                            {preview.issue.defaultVenue ? `Default venue: ${preview.issue.defaultVenue}` : ""}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-ink-700/50">View only — ask the principal or exam coordinator to change settings.</p>
                      </div>
                    )}

                    <div>
                      <h3 className="mb-2 font-serif text-lg">Paper schedule</h3>
                      {preview.papers?.length ? (
                        <div className="overflow-x-auto rounded-lg border border-ink-900/10">
                          <table className="min-w-full text-left text-sm">
                            <thead className="bg-cream/60 text-xs uppercase tracking-wide text-ink-700/60">
                              <tr>
                                <th className="px-3 py-2">Subject</th>
                                <th className="px-3 py-2">Date</th>
                                <th className="px-3 py-2">Time</th>
                                <th className="px-3 py-2">Invigilator sign</th>
                              </tr>
                            </thead>
                            <tbody>
                              {preview.papers.map((paper) => (
                                <tr key={paper.subjectId} className="border-t border-ink-900/5">
                                  <td className="px-3 py-2">
                                    {paper.subjectName}
                                    {paper.isElective ? (
                                      <span className="ml-1 text-xs text-ink-700/50">(elective)</span>
                                    ) : null}
                                  </td>
                                  <td className={`px-3 py-2 ${paper.paperDate ? "" : "text-amber-800"}`}>
                                    {paper.paperDate
                                      ? new Date(paper.paperDate).toLocaleDateString()
                                      : "—"}
                                  </td>
                                  <td
                                    className={`px-3 py-2 ${
                                      String(paper.startTime || "").trim() ? "" : "text-amber-800"
                                    }`}
                                  >
                                    {[paper.startTime, paper.endTime].filter(Boolean).join("–") || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-ink-700/45">__________</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <EmptyNote>
                          No paper calendar rows yet — tickets will use the exam date. Set paper dates under Records → Exams.
                        </EmptyNote>
                      )}
                    </div>

                    <div>
                      <h3 className="mb-2 font-serif text-lg">Students on the sheet</h3>
                      <div className="overflow-x-auto rounded-lg border border-ink-900/10">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-cream/60 text-xs uppercase tracking-wide text-ink-700/60">
                            <tr>
                              <th className="px-3 py-2">Roll</th>
                              <th className="px-3 py-2">Name</th>
                              <th className="px-3 py-2">Admission</th>
                              <th className="px-3 py-2">Photo</th>
                              <th className="px-3 py-2">Papers</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(preview.students || []).map((s) => (
                              <tr key={s.id} className="border-t border-ink-900/5">
                                <td className="px-3 py-2">{s.rollNo}</td>
                                <td className="px-3 py-2">{s.name}</td>
                                <td className="px-3 py-2">{s.admissionNo || "—"}</td>
                                <td className="px-3 py-2">{s.hasPhoto ? "Yes" : "—"}</td>
                                <td className="px-3 py-2">{s.paperCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-xs text-ink-700/50">
                        Upload student photos under Records → Students. PDF packs five tickets per A4 page.
                      </p>
                    </div>
                  </div>
                ) : (
                  <EmptyNote>Could not load hall ticket preview.</EmptyNote>
                )}
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
