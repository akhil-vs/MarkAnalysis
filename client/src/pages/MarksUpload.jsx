import { useEffect, useState } from "react";
import { api, download } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EntryAccessNotice } from "../components/MarkEntryAccess.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import { isLeadership } from "../lib/roles.js";
import { defaultExamId, examLabel } from "../lib/exams.js";
import { FilterBar, FilterField } from "../components/TableToolbar.jsx";
import { useToast } from "../components/Toast.jsx";

export default function MarksUpload() {
  const { user } = useAuth();
  const toast = useToast();
  const leadership = isLeadership(user.role);
  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [classSectionId, setClassSectionId] = useState("");
  const [examId, setExamId] = useState("");
  const [entryAccess, setEntryAccess] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState(null);

  useEffect(() => {
    Promise.all([api("/api/classes"), api("/api/exams")])
      .then(([c, e]) => {
        setClasses(c);
        setExams(e);
        if (c[0]) setClassSectionId(c[0].id);
        if (e.length) setExamId(defaultExamId(e));
      })
      .catch((err) => toast.error(err.message || "Could not load upload options"));
  }, []);

  async function loadAccess() {
    if (!classSectionId || !examId) return;
    const data = await api(`/api/marks?${new URLSearchParams({ classSectionId, examId })}`);
    setEntryAccess(data.entryAccess);
    setSubjects(data.subjects || []);
  }

  useEffect(() => {
    loadAccess().catch(() => {
      setEntryAccess(null);
      setSubjects([]);
    });
  }, [classSectionId, examId]);

  const uploadBlocked =
    !leadership &&
    entryAccess?.pastDeadline &&
    subjects.some((s) => !entryAccess.bySubject?.[s.id]?.canEnter);

  async function send(commit) {
    if (!file) return toast.error("Choose a CSV or Excel file");
    if (uploadBlocked) return toast.error("Request late entry approval before uploading.");
    if (busy) return;

    const body = new FormData();
    body.append("file", file);
    body.append("classSectionId", classSectionId);
    body.append("examId", examId);
    body.append("commit", commit ? "true" : "false");

    setBusy(true);
    setBusyMode(commit ? "commit" : "preview");
    toast.info(commit ? "Uploading and saving drafts…" : "Checking file…");
    try {
      const data = await api("/api/marks/upload", { method: "POST", body });
      setPreview(data);
      const errorCount = data.errors?.length || 0;
      const missingCount = data.missingStudents?.length || 0;
      if (commit) {
        toast.success(
          `Committed ${data.saved} mark${data.saved === 1 ? "" : "s"} as draft` +
            (errorCount ? ` · ${errorCount} row error${errorCount === 1 ? "" : "s"}` : "")
        );
      } else {
        toast.success(
          `Preview ready: ${data.validCount} valid cell${data.validCount === 1 ? "" : "s"}` +
            (errorCount ? ` · ${errorCount} error${errorCount === 1 ? "" : "s"}` : "") +
            (missingCount ? ` · ${missingCount} missing student${missingCount === 1 ? "" : "s"}` : "")
        );
      }
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  const resultCount = preview
    ? preview.preview
      ? preview.validCount ?? 0
      : preview.saved ?? 0
    : 0;

  return (
    <div>
      <PageHeader
        title="Bulk upload"
        subtitle="One template per class and exam. Preview first, then commit drafts. Use AB, EX, or WH for absent, exempt, or withheld."
      />
      <div className="card p-5 space-y-4 max-w-2xl" aria-busy={busy}>
        <FilterBar>
          <FilterField label="Class">
            <select
              className="field"
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
              disabled={busy}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className}-{c.section}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Exam" className="sm:max-w-[15rem]">
            <select
              className="field"
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
              disabled={busy}
            >
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {examLabel(e)}
                </option>
              ))}
            </select>
          </FilterField>
        </FilterBar>
        {subjects.length > 0 && (
          <EntryAccessNotice
            entryAccess={entryAccess}
            subjects={subjects}
            examId={examId}
            classSectionId={classSectionId}
            onChange={() => loadAccess()}
          />
        )}
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || !classSectionId || !examId}
          onClick={() =>
            download(
              `/api/marks/template?classSectionId=${classSectionId}&examId=${examId}`,
              "marks-template.xlsx"
            )
          }
        >
          Download template
        </button>
        <div className="space-y-1.5">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
            }}
          />
          {file && (
            <p className="text-xs text-ink-700/65">
              Selected: <span className="font-medium text-ink-800">{file.name}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => send(false)}
            disabled={busy || uploadBlocked || !file}
          >
            <BusyLabel busy={busyMode === "preview"} idle="Preview" busyText="Checking…" />
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => send(true)}
            disabled={busy || uploadBlocked || !file}
          >
            <BusyLabel busy={busyMode === "commit"} idle="Commit drafts" busyText="Uploading…" />
          </button>
        </div>
        {busy && (
          <p className="text-sm text-ink-700/70" role="status">
            {busyMode === "commit"
              ? "Uploading marks and saving drafts…"
              : "Checking spreadsheet…"}
          </p>
        )}
        {preview && !busy && (
          <div className="text-sm space-y-3 rounded-xl border border-ink-900/10 bg-cream/60 p-3.5">
            <div className="font-medium text-ink-800">
              {preview.preview
                ? `Preview complete · ${resultCount} valid cell${resultCount === 1 ? "" : "s"}`
                : `Upload complete · ${resultCount} mark${resultCount === 1 ? "" : "s"} saved as draft`}
            </div>
            {!preview.preview && (
              <p className="text-ink-700/70">
                Drafts are on the mark register. Submit there when ready for leadership approval.
              </p>
            )}
            {preview.errors?.length > 0 && (
              <div>
                <div className="font-medium text-clay-600">
                  Errors ({preview.errors.length})
                </div>
                <ul className="list-disc pl-5">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row} {e.roll ? `(${e.roll})` : ""} {e.subject || ""} — {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.missingStudents?.length > 0 && (
              <div>
                <div className="font-medium">Missing students in file</div>
                <ul className="list-disc pl-5">
                  {preview.missingStudents.map((s) => (
                    <li key={s.rollNo}>
                      {s.rollNo} {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!preview.errors?.length && !preview.missingStudents?.length && (
              <p className="text-ink-700/70">No row errors or missing students.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
