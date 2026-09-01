import { Link } from "react-router-dom";

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
    <div className={`card p-5 h-full ${to ? "hover:border-clay-500 transition" : ""} ${tone === "alert" ? "border-clay-500/50 bg-[#fbf4ec]" : ""}`}>
      <div className="text-[11px] uppercase tracking-wider text-ink-700/55">{label}</div>
      <div className={`mt-2 font-serif text-4xl leading-none ${tone === "alert" ? "text-clay-600" : ""}`}>
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

export function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="font-serif text-xl leading-tight">{title}</h3>
        {action}
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

export function DashboardHero({ kicker, title, subtitle, actions }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <div className="text-[11px] uppercase tracking-[0.16em] text-ink-700/50 mb-1">{kicker}</div>}
        <h1 className="font-serif text-4xl leading-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-700/65 max-w-xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
