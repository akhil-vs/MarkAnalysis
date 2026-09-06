import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

export function formatDeadline(deadline) {
  if (!deadline) return "Not set";
  return new Date(deadline).toLocaleDateString();
}

export function subjectAccessLabel(access) {
  if (!access?.pastDeadline) return null;
  const when = access.reviewedAt ? ` on ${new Date(access.reviewedAt).toLocaleString()}` : "";
  if (access.canEnter) return `Late entry approved${when}`;
  if (access.requestStatus === "PENDING") return "Requested — waiting for approval";
  if (access.requestStatus === "REJECTED") return `Request rejected${when}`;
  return "Deadline passed — request approval";
}

export async function requestLateEntry({ examId, classSectionId, subjectId }) {
  try {
    return await api("/api/mark-access", {
      method: "POST",
      body: { examId, classSectionId, subjectId },
    });
  } catch (err) {
    // Already pending: treat as success so the teacher sees "Requested".
    if (err.status === 409) {
      return { status: "PENDING", alreadyPending: true };
    }
    throw err;
  }
}

function mergeAccess(entryAccess, overrides) {
  if (!entryAccess) return entryAccess;
  if (!overrides || !Object.keys(overrides).length) return entryAccess;

  const bySubject = { ...(entryAccess.bySubject || {}) };
  for (const [subjectId, patch] of Object.entries(overrides)) {
    const current = bySubject[subjectId];
    // Once the server reports a status (or approval), trust it over optimistic state.
    if (current?.requestStatus || current?.canEnter) continue;
    bySubject[subjectId] = {
      canEnter: false,
      pastDeadline: true,
      deadline: entryAccess.deadline,
      requestStatus: null,
      requestId: null,
      reviewedAt: null,
      ...current,
      ...patch,
    };
  }
  return { ...entryAccess, bySubject };
}

export function EntryAccessNotice({ entryAccess, subjects, examId, classSectionId, onChange }) {
  const [overrides, setOverrides] = useState({});
  const [busySubjectId, setBusySubjectId] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const subjectKey = (subjects || []).map((s) => s.id).join(",");

  useEffect(() => {
    setOverrides({});
    setError("");
    setInfo("");
  }, [entryAccess?.deadline, examId, classSectionId, subjectKey]);

  const access = useMemo(() => mergeAccess(entryAccess, overrides), [entryAccess, overrides]);

  if (!access?.pastDeadline) {
    if (access?.deadline) {
      return (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-900/10 bg-white/70 px-4 py-3 text-sm text-ink-700/75">
          <span>Mark entry deadline</span>
          <span className="rounded-full border border-ink-900/10 bg-cream px-3 py-1 text-xs font-medium text-ink-900">
            {formatDeadline(access.deadline)}
          </span>
        </div>
      );
    }
    return null;
  }

  const locked = (subjects || []).filter((s) => !access.bySubject?.[s.id]?.canEnter);
  const open = (subjects || []).filter((s) => access.bySubject?.[s.id]?.canEnter);
  const pendingCount = locked.filter((s) => access.bySubject?.[s.id]?.requestStatus === "PENDING").length;

  async function handleRequest(subject) {
    setError("");
    setInfo("");
    setBusySubjectId(subject.id);
    try {
      const result = await requestLateEntry({
        examId,
        classSectionId,
        subjectId: subject.id,
      });

      setOverrides((prev) => ({
        ...prev,
        [subject.id]: {
          canEnter: false,
          pastDeadline: true,
          requestStatus: "PENDING",
          reviewedAt: null,
          requestId: result?.id || null,
        },
      }));
      setInfo(
        result?.alreadyPending
          ? `${subject.name} is already requested and waiting for approval.`
          : `${subject.name} late entry requested. Waiting for principal or coordinator approval.`
      );

      try {
        await onChange?.();
      } catch (reloadErr) {
        console.error(reloadErr);
      }
    } catch (err) {
      setError(err.message || "Could not request late entry");
    } finally {
      setBusySubjectId("");
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-clay-500/25 bg-[#fbf4ec] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm text-ink-900">
          The mark entry deadline was{" "}
          <span className="font-medium">{formatDeadline(access.deadline)}</span>.
          {locked.length
            ? pendingCount
              ? ` ${pendingCount} late entry request${pendingCount === 1 ? "" : "s"} waiting for approval.`
              : " Some subjects are locked until leadership approves late entry."
            : " Late entry is approved for the subjects below."}
        </div>
        <span className="rounded-full border border-clay-500/20 bg-white/80 px-3 py-1 text-[11px] font-medium text-clay-600">
          Past deadline
        </span>
      </div>

      {info && <p className="text-sm text-moss-600">{info}</p>}
      {error && <p className="text-sm text-clay-600">{error}</p>}

      {open.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {open.map((subject) => (
            <div
              key={subject.id}
              className="rounded-lg border border-moss-500/20 bg-white/80 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{subject.name}</div>
                <span className="mark-chip mark-chip-approved">Approved</span>
              </div>
              <div className="mt-1 text-xs text-moss-600">
                {subjectAccessLabel(access.bySubject?.[subject.id]) || "Late entry approved"}
              </div>
            </div>
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locked.map((subject) => {
            const subjectAccess = access.bySubject?.[subject.id];
            const label = subjectAccessLabel(subjectAccess);
            const pending = subjectAccess?.requestStatus === "PENDING";
            const rejected = subjectAccess?.requestStatus === "REJECTED";
            const busy = busySubjectId === subject.id;
            return (
              <div
                key={subject.id}
                className={`rounded-lg border bg-white/80 px-3 py-2 text-sm ${
                  pending ? "border-clay-500/35" : "border-ink-900/10"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">{subject.name}</div>
                  {pending && <span className="mark-chip mark-chip-pending">Requested</span>}
                  {rejected && <span className="mark-chip mark-chip-dirty">Rejected</span>}
                  {!pending && !rejected && <span className="mark-chip mark-chip-empty">Locked</span>}
                </div>
                <div className={`mt-1 text-xs ${pending ? "text-clay-600" : "text-ink-700/60"}`}>
                  {label}
                </div>
                {!pending && subjectAccess?.requestStatus !== "APPROVED" && (
                  <button
                    type="button"
                    className="btn-primary mt-2"
                    disabled={Boolean(busySubjectId)}
                    onClick={() => handleRequest(subject)}
                  >
                    {busy ? "Requesting…" : rejected ? "Request again" : "Request late entry"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
