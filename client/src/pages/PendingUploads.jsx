import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import NotifyTeachersDialog from "../components/NotifyTeachersDialog.jsx";
import { Kpi, PageHeader } from "../components/Layout.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { BusyLabel, LoadingState } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { avatarTone, initials } from "../lib/classRecordPresentation.js";
import { paths, NAV_TITLES } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function assignmentSearchText(a) {
  return searchHaystack(a.classLabel, a.subject);
}

function AccordionChevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      className={`shrink-0 text-ink-700/45 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function teacherCountLabel(teacher, mode) {
  if (mode === "awaiting") {
    const n = teacher.awaitingApprovalAssignments;
    return `${n} register${n === 1 ? "" : "s"} awaiting approval`;
  }
  const n = teacher.missingAssignments;
  return `${n} register${n === 1 ? "" : "s"} outstanding`;
}

export default function PendingUploads() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState(searchParams.get("examId") || "");
  const [notify, setNotify] = useState(null);
  const [error, setError] = useState("");

  async function load(id) {
    setError("");
    try {
      const res = await api(`/api/analytics/pending-uploads${id ? `?examId=${id}` : ""}`);
      setData(res);
      if (res.exam) setExamId(res.exam.id);
    } catch (err) {
      setError(err.message || "Could not load upload status");
    }
  }

  useEffect(() => {
    load(searchParams.get("examId") || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <LoadError message={error} />;
  if (!data) return <LoadingState label="Loading upload status…" />;
  if (data.empty) return <p>No exams yet.</p>;

  const pending = (data.teachers || []).filter((t) => t.pending);
  const awaiting = (data.teachers || []).filter((t) => t.awaitingApproval && !t.pending);

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.pendingUploads}
        subtitle={`${data.exam.name} — missing registers and submitted marks waiting for approval`}
        actions={
          <>
            <select className="field-filter" value={examId} onChange={(e) => load(e.target.value)}>
              {(data.exams || []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            {(data.teachers || []).length > 0 && (
              <button
                type="button"
                className="btn-accent"
                onClick={() =>
                  setNotify({
                    kind: pending.length ? "INCOMPLETE" : "DEADLINE",
                    examId,
                    audience: pending.length ? "PENDING" : "ALL",
                    exams: data.exams,
                  })
                }
              >
                Notify teachers
              </button>
            )}
          </>
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
          <Link className="underline" to={`/consolidated?examId=${examId}`}>
            Generate consolidated mark lists
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {awaiting.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="font-serif text-xl">Entered — awaiting your approval</h2>
                <p className="text-sm text-ink-700/60 mt-1">
                  Expand a teacher to approve each register separately. Drafts and other teachers’ registers stay
                  unpublished.
                </p>
              </div>
              <TeacherAccordionList
                key={`${examId}-awaiting`}
                teachers={awaiting}
                mode="awaiting"
                examId={examId}
                onApproved={async (msg, ok = true) => {
                  if (ok) toast.success(msg);
                  else toast.error(msg);
                  await load(examId);
                }}
              />
            </section>
          )}
          {pending.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="font-serif text-xl">Still missing marks</h2>
                <p className="text-sm text-ink-700/60 mt-1">
                  Expand a teacher to see outstanding papers, open the register, or send a reminder.
                </p>
              </div>
              <TeacherAccordionList
                key={`${examId}-pending`}
                teachers={pending}
                mode="pending"
                examId={examId}
                onNotifyTeacher={(t) =>
                  setNotify({
                    kind: "INCOMPLETE",
                    examId,
                    audience: "SELECTED",
                    teacherIds: [t.teacherId],
                    teacherName: t.name,
                    exams: data.exams,
                  })
                }
              />
            </section>
          )}
        </div>
      )}
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

function TeacherAccordionList({ teachers, mode, examId, onApproved, onNotifyTeacher }) {
  const [openTeacherId, setOpenTeacherId] = useState(null);

  return (
    <div className="card overflow-hidden">
      <div className="accordion-list" role="list">
        {teachers.map((t) => (
          <TeacherAccordion
            key={t.teacherId}
            teacher={t}
            mode={mode}
            examId={examId}
            open={openTeacherId === t.teacherId}
            onToggle={() => setOpenTeacherId((current) => (current === t.teacherId ? null : t.teacherId))}
            onApproved={onApproved}
            onNotify={onNotifyTeacher ? () => onNotifyTeacher(t) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function TeacherAccordion({ teacher: t, mode, examId, open, onToggle, onApproved, onNotify }) {
  const confirm = useConfirm();
  const [busyKey, setBusyKey] = useState("");
  const rows =
    mode === "awaiting"
      ? t.assignments.filter(
          (a) =>
            a.status === "AWAITING_APPROVAL" ||
            ((a.submitted ?? 0) > 0 && (a.approved ?? 0) < a.expected)
        )
      : t.assignments.filter((a) => a.missing > 0);
  const table = useTableSearch(rows, { getSearchText: assignmentSearchText });
  const countLabel = teacherCountLabel(t, mode);
  const panelId = `pending-${mode}-panel-${t.teacherId}`;
  const buttonId = `pending-${mode}-trigger-${t.teacherId}`;

  async function approveRegister(a) {
    if (!a.subjectId) {
      return;
    }
    const submittedCount = a.submitted ?? 0;
    const ok = await confirm({
      title: "Approve this teacher’s submitted marks?",
      message: `Approve ${submittedCount} submitted mark${submittedCount === 1 ? "" : "s"} for ${t.name} · ${a.classLabel} · ${a.subject}? Other teachers’ registers stay unpublished.`,
      confirmLabel: "Approve submitted",
    });
    if (!ok) return;
    const key = `${a.classSectionId}-${a.subjectId}`;
    setBusyKey(key);
    try {
      const res = await api("/api/marks/approve", {
        method: "POST",
        body: {
          examId,
          classSectionId: a.classSectionId,
          subjectId: a.subjectId,
          teacherId: t.teacherId,
        },
      });
      await onApproved?.(
        `Approved ${res.approved ?? 0} mark${res.approved === 1 ? "" : "s"} for ${t.name} · ${a.subject}`,
        true
      );
    } catch (err) {
      await onApproved?.(err.message || "Could not approve submitted marks", false);
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className={`accordion-item ${open ? "accordion-item-open" : ""}`} role="listitem">
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          className="accordion-trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(t.teacherId || t.name)}`}
            aria-hidden="true"
          >
            {initials(t.name)}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="font-medium text-ink-900">{t.name}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-700/55">{t.email || "—"}</span>
          </span>
          <span className="hidden sm:flex shrink-0 rounded-lg bg-ink-900/5 px-2 py-1 text-xs font-medium text-clay-600">
            {countLabel}
          </span>
          <AccordionChevron open={open} />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="accordion-panel px-3 sm:px-4 pb-4 pt-1"
      >
        <div className="space-y-3 rounded-lg border border-ink-900/10 bg-white/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="sm:hidden text-xs font-medium text-clay-600">{countLabel}</span>
            {onNotify && (
              <button type="button" className="btn-ghost text-xs ml-auto" onClick={onNotify}>
                Notify
              </button>
            )}
          </div>
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search class or subject"
            matched={table.matched}
            total={table.total}
          />
          <PaginatedTable
            items={table.filtered}
            pageSize={5}
            pageSizeOptions={[5, 10, 25]}
            resetKey={table.resetKey}
            empty="No rows."
            busy={Boolean(busyKey)}
            busyLabel="Approving marks…"
          >
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Subject</th>
                    <th>Entered</th>
                    <th>Submitted</th>
                    <th>Approved</th>
                    <th>Draft</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((a) => {
                    const key = `${a.classSectionId}-${a.subjectId || a.subject}`;
                    return (
                      <tr key={key}>
                        <td>{a.classLabel}</td>
                        <td>{a.subject}</td>
                        <td>
                          {a.uploaded} / {a.expected}
                        </td>
                        <td>{a.submitted ?? 0}</td>
                        <td>{a.approved ?? 0}</td>
                        <td>{a.draft ?? 0}</td>
                        <td className="space-x-2 whitespace-nowrap">
                          <Link
                            className="underline text-xs"
                            to={paths.marks({
                              classSectionId: a.classSectionId,
                              examId,
                              subjectId: a.subjectId || undefined,
                            })}
                          >
                            Open register
                          </Link>
                          {mode === "awaiting" && a.subjectId && (
                            <button
                              type="button"
                              className="btn-accent"
                              disabled={Boolean(busyKey)}
                              onClick={() => approveRegister(a)}
                            >
                              <BusyLabel busy={busyKey === key} idle="Approve submitted" busyText="Approving…" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </div>
      </div>
    </div>
  );
}
