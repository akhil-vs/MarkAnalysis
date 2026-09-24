import { Link } from "react-router-dom";
import { HelpHint, PageHelpHint } from "./HelpHint.jsx";

export const GRADE_COLORS = {
  "A+": "#2f5440",
  A: "#3d6b4f",
  B: "#6b8f4e",
  C: "#c4a035",
  D: "#c45c26",
  F: "#8b2e1f",
};

export function firstName(name = "") {
  return name.replace(/^Dr\.\s+/i, "").split(" ")[0] || name;
}

export function greeting(name) {
  const hour = new Date().getHours();
  const when = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${when}, ${firstName(name)}`;
}

export function deltaLabel(current, previous) {
  if (current == null || previous == null) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return { text: "Same as last exam", tone: "flat" };
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${diff} vs last exam`,
    tone: diff > 0 ? "up" : "down",
  };
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink-900/10 bg-cream px-3 py-2 text-xs shadow-md">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="text-ink-700/80">
          {p.name}: <span className="font-medium text-ink-900">{p.value}{typeof p.value === "number" && p.dataKey !== "count" ? "" : ""}</span>
        </div>
      ))}
    </div>
  );
}

export function Metric({ label, value, hint, tone, to }) {
  const body = (
    <div className={`card p-3.5 sm:p-5 h-full ${to ? "hover:border-clay-500 transition" : ""} ${tone === "alert" ? "border-clay-500/50 bg-[#fbf4ec]" : ""}`}>
      <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-ink-700/55">{label}</div>
      <div className={`mt-2 font-serif text-3xl sm:text-4xl leading-none ${tone === "alert" ? "text-clay-600" : ""}`}>
        {value ?? "—"}
      </div>
      {hint && (
        <div className={`mt-2 text-xs ${hint.tone === "up" ? "text-moss-600" : hint.tone === "down" ? "text-clay-600" : "text-ink-700/55"}`}>
          {hint.text}
        </div>
      )}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}

export function Panel({ title, action, children, className = "", help }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 mb-4">
        <h3 className="font-serif text-lg sm:text-xl leading-tight flex items-center gap-2">
          <span>{title}</span>
          {help && <HelpHint help={help} label={`About ${typeof title === "string" ? title : "this section"}`} size="sm" />}
        </h3>
        {action && <div className="flex flex-wrap gap-2 shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function GradePill({ grade }) {
  if (!grade) return <span className="text-ink-700/40">—</span>;
  const color = GRADE_COLORS[grade] || "#33415f";
  return (
    <span
      className="inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
      style={{ background: color }}
    >
      {grade}
    </span>
  );
}

export function BarTrack({ value, max = 100, color = "#1b2437" }) {
  const pct = Math.max(0, Math.min(100, ((value ?? 0) / max) * 100));
  return (
    <div className="h-2 rounded-full bg-ink-900/10 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function RankRow({ rank, name, to, meta, value, grade }) {
  const inner = (
    <div className="flex items-center gap-3 py-2.5 border-t border-ink-900/8 first:border-0">
      <div className="w-6 text-xs text-ink-700/45 tabular-nums">{rank}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        {meta && <div className="text-[11px] text-ink-700/50">{meta}</div>}
      </div>
      {grade && <GradePill grade={grade} />}
      <div className="text-sm tabular-nums w-12 text-right">{value ?? "—"}</div>
    </div>
  );
  return to ? <Link to={to} className="block hover:bg-white/50 -mx-1 px-1 rounded-lg">{inner}</Link> : inner;
}

export function EmptyNote({ children }) {
  return <p className="text-sm text-ink-700/60 py-4">{children}</p>;
}

/**
 * Home desk when no exam (or teacher has no assignments) — never a blank page.
 * Shows school setup counts and next-step links so leadership can schedule an exam.
 */
export function EmptyExamDashboard({
  role,
  name,
  setup,
  reason = "NO_EXAM",
  help,
}) {
  const leadership = role === "PRINCIPAL" || role === "EXAM_COORDINATOR";
  const noAssignments = reason === "NO_ASSIGNMENTS";
  const kicker =
    role === "TEACHER" ? "Teacher desk" : role === "EXAM_COORDINATOR" ? "Exam coordination" : "Principal desk";

  const subtitle = noAssignments
    ? "You are signed in, but no class or subject is assigned to you yet. Ask the principal to assign your papers under Staff."
    : leadership
      ? "No exam is scheduled yet. School analytics, upload queues, and registers will appear here once the first exam is on the calendar."
      : "No exam is scheduled yet. Your registers, section strength, and watchlist will appear here when leadership schedules an exam.";

  const steps = noAssignments
    ? [
        {
          title: "Wait for an assignment",
          body: "The principal links each teacher to class sections and subjects under Staff.",
          to: null,
        },
        {
          title: "Then open mark entry",
          body: "Once assigned, your papers show here and under Mark register.",
          to: "/marks",
        },
      ]
    : leadership
      ? [
          {
            title: "Confirm classes & subjects",
            body: "Records should list every division and paper you teach before you schedule.",
            to: "/manage",
            cta: "Open records",
          },
          {
            title: "Schedule the first exam",
            body: "Add a term exam under Records → Exams. That becomes the working paper for this desk.",
            to: "/manage?tab=Exams",
            cta: "Schedule an exam",
          },
          {
            title: "Assign teachers",
            body: "Staff assignments drive pending uploads and teacher comparison on this desk.",
            to: "/users",
            cta: "Open staff",
          },
        ]
      : [
          {
            title: "Wait for the exam calendar",
            body: "Principals and coordinators schedule exams under Records. You will see them here automatically.",
            to: null,
          },
          {
            title: "Keep leave and notices handy",
            body: "You can still request leave and read notices while exams are being set up.",
            to: null,
          },
        ];

  return (
    <div>
      <DashboardHero
        kicker={kicker}
        title={greeting(name)}
        subtitle={subtitle}
        help={help}
        actions={
          leadership && !noAssignments ? (
            <Link className="btn-accent" to="/manage?tab=Exams">
              Schedule an exam
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric label="Classes" value={setup?.classes ?? 0} to={leadership ? "/manage" : undefined} />
        <Metric label="Subjects" value={setup?.subjects ?? 0} to={leadership ? "/manage" : undefined} />
        <Metric
          label="Students on roll"
          value={setup?.students ?? 0}
          to={leadership ? "/manage?tab=Students" : undefined}
        />
        <Metric
          label={leadership ? "Teachers" : "Your assignments"}
          value={leadership ? (setup?.teachers ?? 0) : (setup?.assignments ?? 0)}
          to={leadership ? "/users" : undefined}
        />
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <Panel
          className="lg:col-span-7"
          title={noAssignments ? "Getting assigned" : "Get this desk ready"}
        >
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-900/8 text-xs font-medium tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-900">{step.title}</div>
                  <p className="mt-0.5 text-sm text-ink-700/65">{step.body}</p>
                  {step.to && step.cta && (
                    <Link className="mt-1.5 inline-block text-xs underline text-ink-700/60" to={step.to}>
                      {step.cta}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel className="lg:col-span-5" title="What will show here">
          {leadership ? (
            <ul className="space-y-2 text-sm text-ink-700/70">
              <li>School average, pass rate, and register readiness</li>
              <li>Teachers still missing uploads or awaiting approval</li>
              <li>Class, subject, and teacher leaderboards for the working exam</li>
            </ul>
          ) : (
            <ul className="space-y-2 text-sm text-ink-700/70">
              <li>Your class registers and how complete each one is</li>
              <li>Section strength across the papers you teach</li>
              <li>Students to watch and year-on-year movement</li>
            </ul>
          )}
          <EmptyNote>
            {noAssignments
              ? "Nothing is blank forever — once you have an assignment, this desk fills in."
              : "Nothing is blank forever — schedule an exam and this desk fills in."}
          </EmptyNote>
        </Panel>
      </div>
    </div>
  );
}

export function DashboardHero({ kicker, title, subtitle, actions, help }) {
  return (
    <div className="mb-5 sm:mb-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {kicker && <div className="text-[11px] uppercase tracking-[0.16em] text-ink-700/50 mb-1">{kicker}</div>}
        <h1 className="font-serif text-2xl sm:text-4xl leading-tight flex items-center gap-2.5 flex-wrap">
          <span>{title}</span>
          <PageHelpHint help={help} />
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-700/65 max-w-xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 w-full sm:w-auto">{actions}</div>}
    </div>
  );
}
