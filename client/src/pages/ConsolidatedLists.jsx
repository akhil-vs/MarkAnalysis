import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, download } from "../api.js";
import { ExamSelect } from "../components/AnalysisPanels.jsx";
import { EmptyNote, Panel } from "../components/DashboardKit.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { useToast } from "../components/Toast.jsx";
import NotifyTeachersDialog from "../components/NotifyTeachersDialog.jsx";
import { NAV_TITLES, paths } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function cmlStudentSearchText(row) {
  return searchHaystack(row.name, row.rollNo, row.grade, row.rank, row.total, row.percent);
}

function LoadingShell({ label }) {
  return (
    <div className="card relative overflow-hidden min-h-[12rem]">
      <div
        className="absolute inset-0 z-10 flex items-center justify-center bg-cream/55 backdrop-blur-[1px]"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <div className="inline-flex items-center gap-2 rounded-lg border border-ink-900/10 bg-white/95 px-3 py-2 text-sm text-ink-700 shadow-sm">
          <Spinner className="h-4 w-4 text-ink-900" label="" />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}

function initialClassSectionId(params) {
  return params.get("classSectionId") || params.get("class") || "";
}

function groupClassesByName(sections) {
  const byName = new Map();
  for (const section of sections) {
    const key = section.className;
    if (!byName.has(key)) {
      byName.set(key, {
        className: key,
        label: key,
        divisions: [],
        studentCount: 0,
        readyCount: 0,
        draftCount: 0,
        approvedSubjects: 0,
        totalSubjects: 0,
      });
    }
    const group = byName.get(key);
    group.divisions.push(section);
    group.studentCount += section.studentCount || 0;
    group.draftCount += section.draftCount || 0;
    group.approvedSubjects += section.approvedSubjects || 0;
    group.totalSubjects += section.totalSubjects || 0;
    if (section.ready) group.readyCount += 1;
  }
  return [...byName.values()].map((group) => {
    const divisionCount = group.divisions.length;
    const ready = divisionCount > 0 && group.readyCount === divisionCount;
    const complete = divisionCount > 0 && group.divisions.every((d) => d.complete);
    return {
      ...group,
      divisionCount,
      ready,
      complete,
    };
  });
}

export default function ConsolidatedLists() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState(params.get("examId") || "");
  const [selectedClassName, setSelectedClassName] = useState(params.get("className") || "");
  const [selectedId, setSelectedId] = useState(initialClassSectionId(params));
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [previewLoading, setPreviewLoading] = useState(Boolean(initialClassSectionId(params)));
  const [notify, setNotify] = useState(null);

  async function loadStatus(id) {
    const res = await api(`/api/exports/consolidated${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  async function loadPreview(classId, id = examId) {
    if (!classId) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setError("");
    try {
      const res = await api(`/api/exports/consolidated/${classId}?examId=${id}&format=json`);
      setPreview(res);
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    loadStatus(examId).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedId && examId) {
      loadPreview(selectedId, examId).catch((e) => {
        setError(e.message);
        setPreviewLoading(false);
      });
    } else {
      setPreviewLoading(false);
    }
  }, [selectedId, examId]);

  const sections = data?.classes;
  const classGroups = useMemo(() => groupClassesByName(sections || []), [sections]);

  useEffect(() => {
    if (!sections?.length) return;
    if (selectedId) {
      const match = sections.find((c) => c.id === selectedId);
      if (match && match.className !== selectedClassName) {
        setSelectedClassName(match.className);
      }
      return;
    }
    if (selectedClassName && !classGroups.some((g) => g.className === selectedClassName)) {
      setSelectedClassName("");
    }
  }, [sections, selectedId, selectedClassName, classGroups]);

  function syncParams({ exam = examId, className = selectedClassName, classSectionId = selectedId } = {}) {
    const next = new URLSearchParams(params);
    if (exam) next.set("examId", exam);
    else next.delete("examId");
    if (className) next.set("className", className);
    else next.delete("className");
    if (classSectionId) next.set("classSectionId", classSectionId);
    else next.delete("classSectionId");
    next.delete("class");
    setParams(next, { replace: true });
  }

  function onExam(id) {
    setExamId(id);
    setPreview(null);
    if (selectedId) setPreviewLoading(true);
    syncParams({ exam: id });
    loadStatus(id).catch((e) => setError(e.message));
  }

  function selectClassGroup(className) {
    setSelectedClassName(className);
    setSelectedId("");
    setPreview(null);
    setPreviewLoading(false);
    setError("");
    syncParams({ className, classSectionId: "" });
  }

  function clearClassGroup() {
    setSelectedClassName("");
    setSelectedId("");
    setPreview(null);
    setPreviewLoading(false);
    setError("");
    syncParams({ className: "", classSectionId: "" });
  }

  function selectDivision(id) {
    setSelectedId(id);
    if (id !== selectedId) {
      setPreview(null);
      setPreviewLoading(Boolean(id));
      setError("");
    }
    const match = (data?.classes || []).find((c) => c.id === id);
    const className = match?.className || selectedClassName;
    if (className) setSelectedClassName(className);
    syncParams({ className, classSectionId: id || "" });
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
      toast.success(`Downloaded ${format.toUpperCase()} mark list.`);
    } catch (e) {
      const msg = e.message || "Download failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy("");
    }
  }

  if (!data && !error) {
    return (
      <div>
        <PageHeader
          title={NAV_TITLES.consolidated}
          subtitle="After teachers enter and you approve marks, generate the official class list — every student, every subject, totals, grade, and rank."
        />
        <LoadingShell label="Loading mark lists…" />
      </div>
    );
  }
  if (data?.empty) return <p>No exam data yet.</p>;

  const allSections = sections || [];
  const selectedClass = classGroups.find((g) => g.className === selectedClassName) || null;
  const divisions = selectedClass?.divisions || [];
  const selected = divisions.find((c) => c.id === selectedId) || allSections.find((c) => c.id === selectedId);
  const tableBusy = previewLoading || Boolean(busy);
  const tableBusyLabel = previewLoading ? "Loading mark list…" : "Preparing download…";

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.consolidated}
        subtitle="After teachers enter and you approve marks, generate the official class list — every student, every subject, totals, grade, and rank."
        actions={data?.exams ? <ExamSelect exams={data.exams} value={examId} onChange={onExam} /> : null}
      />

      {error && <p className="text-clay-600 text-sm mb-3">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-700/60">Divisions ready</div>
          <div className="font-serif text-3xl mt-1">{data?.readyCount ?? 0} / {allSections.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-700/60">Working exam</div>
          <div className="font-serif text-2xl mt-1">{data?.examLabel || data?.exam?.name}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-ink-700/60">How it works</div>
          <p className="text-sm text-ink-700/70 mt-1">
            Pick a class, then a division. Teachers enter registers, leadership approves, then generate Excel or PDF.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        <Panel
          className="lg:col-span-4"
          title={selectedClass ? `Divisions · ${selectedClass.label}` : "Classes"}
          action={
            selectedClass ? (
              <button type="button" className="btn-ghost text-xs" onClick={clearClassGroup}>
                Change class
              </button>
            ) : null
          }
        >
          <div className="space-y-2">
            {!selectedClass ? (
              <>
                <p className="text-xs text-ink-700/55 mb-1">Select a class to see its divisions.</p>
                {classGroups.map((group) => (
                  <button
                    key={group.className}
                    type="button"
                    onClick={() => selectClassGroup(group.className)}
                    className="w-full text-left rounded-lg border border-ink-900/10 px-3 py-2.5 hover:border-clay-500"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif text-xl">{group.label}</span>
                      <StatusPill ready={group.ready} complete={group.complete} drafts={group.draftCount} />
                    </div>
                    <div className="text-[11px] text-ink-700/55 mt-1">
                      {group.divisionCount} division{group.divisionCount === 1 ? "" : "s"}
                      {group.readyCount < group.divisionCount
                        ? ` · ${group.readyCount}/${group.divisionCount} ready`
                        : ""}
                      {" · "}
                      {group.studentCount} students
                    </div>
                  </button>
                ))}
                {!classGroups.length && <EmptyNote>No classes on roll.</EmptyNote>}
              </>
            ) : (
              <>
                <p className="text-xs text-ink-700/55 mb-1">Select a division to open its consolidated mark list.</p>
                {divisions.map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => selectDivision(cls.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 ${
                      selectedId === cls.id ? "border-clay-500 bg-[#fbf4ec]" : "border-ink-900/10 hover:border-clay-500"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-serif text-xl">{cls.section}</span>
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
                {!divisions.length && <EmptyNote>No divisions in this class.</EmptyNote>}
              </>
            )}
          </div>
        </Panel>

        <div className="lg:col-span-8">
          {!selectedClass && <EmptyNote>Choose a class, then a division, to preview its consolidated mark list.</EmptyNote>}
          {selectedClass && !selected && (
            <EmptyNote>Choose a division of {selectedClass.label} to preview its consolidated mark list.</EmptyNote>
          )}
          {selected && previewLoading && !preview && (
            <LoadingShell label="Loading mark list…" />
          )}
          {selected && preview && (
            <Panel
              title={`${preview.label} — ${preview.examLabel}`}
              action={
                <div className="flex flex-wrap gap-2">
                  {!preview.ready && (
                    <button
                      type="button"
                      className="btn-accent"
                      disabled={tableBusy}
                      onClick={() =>
                        setNotify({
                          kind: "INCOMPLETE",
                          examId,
                          audience: "PENDING",
                          classSectionId: selected.id,
                          classLabel: selected.label,
                          exams: data.exams,
                        })
                      }
                    >
                      Notify teachers
                    </button>
                  )}
                  <button className="btn-primary" disabled={tableBusy} onClick={() => generate("xlsx")}>
                    {busy === "xlsx" ? "Preparing…" : "Excel"}
                  </button>
                  <button className="btn-ghost" disabled={tableBusy} onClick={() => generate("pdf")}>
                    {busy === "pdf" ? "Preparing…" : "PDF"}
                  </button>
                </div>
              }
            >
              {preview.ready ? (
                <p className="text-sm text-moss-600 mb-3">All subject registers are approved. This is the official list.</p>
              ) : (
                <p className="text-sm text-clay-600 mb-3">
                  Preview with provisional totals from entered marks (including drafts).
                  {preview.missingSubjects?.length ? ` Outstanding: ${preview.missingSubjects.join(", ")}.` : ""}
                  {" "}
                  Approve remaining registers for the official list.{" "}
                  <Link className="underline" to={paths.pendingUploads()}>Pending uploads</Link>
                  {" · "}
                  <Link className="underline" to={paths.marks()}>Mark register</Link>
                </p>
              )}

              <CmlStudentTable
                students={preview.students}
                subjects={preview.subjects}
                resetKey={selectedId}
                busy={tableBusy}
                busyLabel={tableBusyLabel}
              />
            </Panel>
          )}
        </div>
      </div>
      {notify && (
        <NotifyTeachersDialog
          {...notify}
          onClose={() => setNotify(null)}
          onSent={(result) => {
            const n = result.sent ?? 0;
            if (n) toast.success(`Notified ${n} teacher${n === 1 ? "" : "s"}.`);
            else toast.info("No new notices sent.");
          }}
        />
      )}
    </div>
  );
}

function CmlStudentTable({ students, subjects, resetKey, busy = false, busyLabel = "Loading mark list…" }) {
  const table = useTableSearch(students, { getSearchText: cmlStudentSearchText });
  return (
    <>
      <div className="mb-3">
        <TableToolbar
          q={table.q}
          setQ={table.setQ}
          placeholder="Search name, roll, or grade"
          matched={table.matched}
          total={table.total}
        />
      </div>
      <PaginatedTable
        items={table.filtered}
        pageSize={15}
        pageSizeOptions={[15, 25, 50]}
        resetKey={`${resetKey}:${table.resetKey}`}
        empty="No students in this class."
        busy={busy}
        busyLabel={busyLabel}
      >
        {(page) => (
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Roll</th>
                <th>Name</th>
                {subjects.map((s) => (
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
                    <Link className="underline" to={paths.student(row.studentId)}>{row.name}</Link>
                  </td>
                  {subjects.map((s) => {
                    const cell = row.bySubject[s.id];
                    if (!cell || cell.status === "MISSING") return <td key={s.id} className="text-ink-700/35">—</td>;
                    if (cell.status === "DRAFT" || cell.status === "SUBMITTED") {
                      return (
                        <td
                          key={s.id}
                          className="text-clay-600"
                          title={cell.status === "SUBMITTED" ? "Submitted — awaiting approval" : "Draft — not approved"}
                        >
                          {cell.display || cell.marks}
                        </td>
                      );
                    }
                    return <td key={s.id}>{cell.display || cell.marks}</td>;
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
    </>
  );
}

function StatusPill({ ready, complete, drafts }) {
  if (ready) return <span className="text-[10px] uppercase tracking-wide text-moss-600">Ready</span>;
  if (complete && drafts) return <span className="text-[10px] uppercase tracking-wide text-clay-600">Drafts left</span>;
  return <span className="text-[10px] uppercase tracking-wide text-ink-700/50">In progress</span>;
}
