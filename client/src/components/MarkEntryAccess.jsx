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
        <div className="mb-4 card p-4 text-sm text-ink-700/70">
          Mark entry deadline: <span className="font-medium text-ink-900">{formatDeadline(entryAccess.deadline)}</span>
        </div>
      );
    }
    return null;
  }

  const locked = subjects.filter((s) => !entryAccess.bySubject?.[s.id]?.canEnter);

  return (
    <div className="mb-4 card p-4 space-y-3 border-clay-500/30 bg-[#fbf4ec]">
      <div className="text-sm">
        The mark entry deadline was <span className="font-medium">{formatDeadline(entryAccess.deadline)}</span>.
        {locked.length ? " Some registers are locked until leadership approves late entry." : " You have approved late entry for this register."}
      </div>
      {locked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locked.map((subject) => {
            const access = entryAccess.bySubject?.[subject.id];
            const label = subjectAccessLabel(access);
            return (
              <div key={subject.id} className="rounded-lg border border-ink-900/10 bg-white/70 px-3 py-2 text-sm">
                <div className="font-medium">{subject.name}</div>
                <div className="text-xs text-ink-700/60 mt-1">{label}</div>
                {access?.requestStatus !== "PENDING" && access?.requestStatus !== "APPROVED" && (
                  <button
                    type="button"
                    className="btn-primary mt-2"
                    onClick={async () => {
                      await requestLateEntry({ examId, classSectionId, subjectId: subject.id });
                      onChange?.();
                    }}
                  >
                    Request approval
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
