import { examLabel } from "../lib/exams.js";
import { SCHOOL_SECTIONS, schoolSectionLabel } from "../lib/schoolSections.js";
import { useWorkspaceOptional } from "../workspace.jsx";
import { isLeadership } from "../lib/roles.js";
import { useAuth } from "../auth.jsx";

/** Compact exam (+ section for leadership) control for the app shell. */
export default function WorkspaceChip({ compact = false, tone = "dark" }) {
  const { user } = useAuth();
  const ws = useWorkspaceOptional();
  if (!ws || !user || user.role === "PLATFORM_ADMIN") return null;

  const { exams, examId, schoolSection, setExamId, setSchoolSection, loading } = ws;
  const leadership = isLeadership(user.role);

  if (!exams?.length && !loading) return null;

  const dark = tone === "dark";
  const shell = dark
    ? compact
      ? ""
      : "rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
    : "rounded-lg border border-ink-900/10 bg-white/80 px-2 py-1.5";
  const labelCls = dark
    ? "flex min-w-0 items-center gap-1.5 text-[10px] uppercase tracking-wider text-cream/45"
    : "flex min-w-0 items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-700/50";
  const selectCls = dark
    ? "max-w-[11rem] truncate rounded-md border border-white/10 bg-ink-950/80 px-2 py-1 text-xs normal-case tracking-normal text-cream"
    : "max-w-[11rem] truncate rounded-md border border-ink-900/15 bg-white px-2 py-1 text-xs normal-case tracking-normal text-ink-900";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${shell}`}>
      <label className={labelCls}>
        <span className="shrink-0">Exam</span>
        <select
          className={selectCls}
          value={examId || ""}
          disabled={loading || !exams.length}
          onChange={(e) => setExamId(e.target.value)}
          aria-label="Working exam"
        >
          {(exams || []).map((exam) => (
            <option key={exam.id} value={exam.id}>
              {examLabel(exam)}
            </option>
          ))}
        </select>
      </label>
      {leadership && (
        <label className={labelCls}>
          <span className="shrink-0">Section</span>
          <select
            className={selectCls.replace("max-w-[11rem]", "max-w-[9rem]")}
            value={schoolSection || "ALL"}
            disabled={loading}
            onChange={(e) => setSchoolSection(e.target.value)}
            aria-label="School section"
          >
            {SCHOOL_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shortLabel || schoolSectionLabel(s.id)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
