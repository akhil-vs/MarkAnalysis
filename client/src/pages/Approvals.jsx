import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { BusyLabel, LoadingState } from "../components/Spinner.jsx";
import { useToast } from "../components/Toast.jsx";
import { useWorkspaceOptional } from "../workspace.jsx";

const TABS = [
  { id: "registers", label: "Submitted registers" },
  { id: "access", label: "Access requests" },
];

export default function Approvals() {
  const toast = useToast();
  const confirm = useConfirm();
  const workspace = useWorkspaceOptional();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "access" ? "access" : "registers";
  const examFilter = params.get("examId") || workspace?.examId || "";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load(nextTab = tab, examId = examFilter) {
    setError("");
    try {
      const q = new URLSearchParams({ tab: nextTab });
      if (examId) q.set("examId", examId);
      const res = await api(`/api/approvals/inbox?${q}`);
      setData(res);
    } catch (err) {
      setError(err.message || "Could not load approvals");
      setData(null);
    }
  }

  useEffect(() => {
    load(tab, examFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, examFilter]);

  function selectTab(next) {
    const nextParams = new URLSearchParams(params);
    if (next === "registers") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  }

  async function approveRegister(item) {
    const ok = await confirm({
      title: "Approve submitted register?",
      message: `Approve ${item.submittedCount} mark${item.submittedCount === 1 ? "" : "s"} for ${item.teacherName} · ${item.examName} · ${item.classLabel} · ${item.subjectName}?`,
      confirmLabel: "Approve",
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      const res = await api("/api/approvals/registers/approve", {
        method: "POST",
        body: {
          items: [
            {
              examId: item.examId,
              classSectionId: item.classSectionId,
              subjectId: item.subjectId,
              teacherId: item.teacherId,
            },
          ],
        },
      });
      toast.success(`Approved ${res.approvedTotal ?? 0} mark${res.approvedTotal === 1 ? "" : "s"}`);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not approve");
    } finally {
      setBusyId("");
    }
  }

  async function reviewAccess(item, decision) {
    const ok = await confirm({
      title: decision === "APPROVED" ? "Approve access request?" : "Reject access request?",
      message: `${item.accessKind === "EDIT" ? "Edit" : "Late entry"} for ${item.teacherName} · ${item.classLabel} · ${item.subjectName}`,
      confirmLabel: decision === "APPROVED" ? "Approve" : "Reject",
      tone: decision === "APPROVED" ? "default" : "danger",
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await api(`/api/mark-access/${item.requestId}`, {
        method: "PATCH",
        body: { status: decision },
      });
      toast.success(decision === "APPROVED" ? "Access approved" : "Access rejected");
      await load();
    } catch (err) {
      toast.error(err.message || "Could not update request");
    } finally {
      setBusyId("");
    }
  }

  if (error) return <LoadError message={error} />;
  if (!data) return <LoadingState label="Loading approvals…" />;

  const items = data.items || [];

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Clear submitted registers and late-entry / edit requests in one place"
      />

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${tab === t.id ? "btn-primary" : "btn-ghost"} shrink-0`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
            {tab === t.id ? ` (${data.count ?? 0})` : ""}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card p-5 text-ink-700/70">
          Nothing waiting in this queue.{" "}
          <Link className="underline" to="/pending-uploads">
            Open mark progress
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="font-medium text-ink-900">
                  {item.teacherName} · {item.classLabel} · {item.subjectName}
                </div>
                <div className="mt-1 text-sm text-ink-700/65">
                  {item.examName}
                  {item.kind === "register"
                    ? ` · ${item.submittedCount} submitted`
                    : ` · ${item.accessKind === "EDIT" ? "Edit request" : "Late entry"}`}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Link className="btn-ghost" to={item.marksPath}>
                  Open register
                </Link>
                {item.kind === "register" ? (
                  <button
                    type="button"
                    className="btn-accent"
                    disabled={busyId === item.id}
                    onClick={() => approveRegister(item)}
                  >
                    <BusyLabel busy={busyId === item.id} idle="Approve" busyText="Approving…" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn-accent"
                      disabled={busyId === item.id}
                      onClick={() => reviewAccess(item, "APPROVED")}
                    >
                      <BusyLabel busy={busyId === item.id} idle="Approve" busyText="Saving…" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busyId === item.id}
                      onClick={() => reviewAccess(item, "REJECTED")}
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
