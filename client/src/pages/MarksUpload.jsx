import { useEffect, useState } from "react";
import { api, download, getToken } from "../api.js";
import { useAuth } from "../auth.jsx";
import { EntryAccessNotice } from "../components/MarkEntryAccess.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { isLeadership } from "../lib/roles.js";

export default function MarksUpload() {
  const { user } = useAuth();
  const leadership = isLeadership(user.role);
  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [classSectionId, setClassSectionId] = useState("");
  const [examId, setExamId] = useState("");
  const [entryAccess, setEntryAccess] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([api("/api/classes"), api("/api/exams")]).then(([c, e]) => {
      setClasses(c);
      setExams(e);
      if (c[0]) setClassSectionId(c[0].id);
      if (e[0]) setExamId(e[0].id);
    });
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
    if (!file) return setMessage("Choose a CSV or Excel file");
    if (uploadBlocked) return setMessage("Request late entry approval before uploading.");
    const body = new FormData();
    body.append("file", file);
    body.append("classSectionId", classSectionId);
    body.append("examId", examId);
    body.append("commit", commit ? "true" : "false");
    const token = getToken();
    const res = await fetch("/api/marks/upload", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || "Upload failed");
    setPreview(data);
    setMessage(commit ? `Committed ${data.saved} marks as draft` : `Preview: ${data.validCount} valid cells`);
  }

  return (
    <div>
      <PageHeader
        title="Bulk upload"
        subtitle="One template per class and exam. Preview first, then commit drafts."
      />
      <div className="card p-5 space-y-4 max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-3">
          <select className="field" value={classSectionId} onChange={(e) => setClassSectionId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
          </select>
          <select className="field" value={examId} onChange={(e) => setExamId(e.target.value)}>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        {subjects.length > 0 && (
          <EntryAccessNotice
            entryAccess={entryAccess}
            subjects={subjects}
            examId={examId}
            classSectionId={classSectionId}
            onChange={loadAccess}
          />
        )}
        <button
          className="btn-ghost"
          onClick={() =>
            download(
              `/api/marks/template?classSectionId=${classSectionId}&examId=${examId}`,
              "marks-template.xlsx"
            )
          }
        >
          Download template
        </button>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => send(false)} disabled={uploadBlocked}>Preview</button>
          <button className="btn-primary" onClick={() => send(true)} disabled={uploadBlocked}>Commit drafts</button>
        </div>
        {message && <p className="text-sm">{message}</p>}
        {preview && (
          <div className="text-sm space-y-3">
            {preview.errors?.length > 0 && (
              <div>
                <div className="font-medium text-clay-600">Errors</div>
                <ul className="list-disc pl-5">
                  {preview.errors.map((e, i) => (
                    <li key={i}>Row {e.row} {e.roll ? `(${e.roll})` : ""} {e.subject || ""} — {e.error}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.missingStudents?.length > 0 && (
              <div>
                <div className="font-medium">Missing students in file</div>
                <ul className="list-disc pl-5">
                  {preview.missingStudents.map((s) => (
                    <li key={s.rollNo}>{s.rollNo} {s.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
