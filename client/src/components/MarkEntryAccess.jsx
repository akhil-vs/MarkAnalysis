import { api } from "../api.js";

export function formatDeadline(deadline) {
  if (!deadline) return "Not set";
  return new Date(deadline).toLocaleDateString();
}

export function subjectAccessLabel(access) {
  if (!access?.pastDeadline) return null;
  const when = access.reviewedAt ? ` on ${new Date(access.reviewedAt).toLocaleString()}` : "";
  if (access.canEnter) return `Late entry approved${when}`;
  if (access.requestStatus === "PENDING") return "Approval pending";
  if (access.requestStatus === "REJECTED") return `Request rejected${when}`;
  return "Deadline passed — request approval";
}

export async function requestLateEntry({ examId, classSectionId, subjectId }) {
  return api("/api/mark-access", {
    method: "POST",
    body: { examId, classSectionId, subjectId },
  });
}

export function EntryAccessNotice({ entryAccess, subjects, examId, classSectionId, onChange }) {
  if (!entryAccess?.pastDeadline) {
    if (entryAccess?.deadline) {
      return (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-900/10 bg-white/70 px-4 py-3 text-sm text-ink-700/75">
          <span>Mark entry deadline</span>
          <span className="rounded-full border border-ink-900/10 bg-cream px-3 py-1 text-xs font-medium text-ink-900">
            {formatDeadline(entryAccess.deadline)}
          </span>
        </div>
      );
    }
    return null;
  }

  const locked = (subjects || []).filter((s) => !entryAccess.bySubject?.[s.id]?.canEnter);
  const open = (subjects || []).filter((s) => entryAccess.bySubject?.[s.id]?.canEnter);

  return (
    <div className="mb-4 rounded-xl border border-clay-500/25 bg-[#fbf4ec] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm text-ink-900">
          The mark entry deadline was{" "}
          <span className="font-medium">{formatDeadline(entryAccess.deadline)}</span>.
          {locked.length
            ? " Some subjects are locked until leadership approves late entry."
            : " Late entry is approved for the subjects below."}
        </div>
        <span className="rounded-full border border-clay-500/20 bg-white/80 px-3 py-1 text-[11px] font-medium text-clay-600">
          Past deadline
        </span>
      </div>

      {open.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {open.map((subject) => (
            <div
              key={subject.id}
              className="rounded-lg border border-moss-500/20 bg-white/80 px-3 py-2 text-sm"
            >
              <div className="font-medium">{subject.name}</div>
              <div className="mt-1 text-xs text-moss-600">
                {subjectAccessLabel(entryAccess.bySubject?.[subject.id]) || "Late entry approved"}
              </div>
            </div>
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locked.map((subject) => {
            const access = entryAccess.bySubject?.[subject.id];
            const label = subjectAccessLabel(access);
            const pending = access?.requestStatus === "PENDING";
            return (
              <div
                key={subject.id}
                className="rounded-lg border border-ink-900/10 bg-white/80 px-3 py-2 text-sm"
              >
                <div className="font-medium">{subject.name}</div>
                <div className="mt-1 text-xs text-ink-700/60">{label}</div>
                {!pending && access?.requestStatus !== "APPROVED" && (
                  <button
                    type="button"
                    className="btn-primary mt-2"
                    onClick={async () => {
                      await requestLateEntry({ examId, classSectionId, subjectId: subject.id });
                      onChange?.();
                    }}
                  >
                    Request late entry
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
