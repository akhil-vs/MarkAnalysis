import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarTrack, EmptyNote, Panel } from "./DashboardKit.jsx";
import { TableToolbar } from "./TableToolbar.jsx";
import {
  HUB_TABS,
  SORT_OPTIONS,
  benchmarkStatus,
  filterHubRows,
  sortHubRows,
} from "../lib/curricularHub.js";
import { paths } from "../lib/nav.js";

export { HUB_TABS, SORT_OPTIONS, benchmarkStatus, filterHubRows, sortHubRows };

function StatusPill({ status }) {
  const tone =
    status.tone === "up"
      ? "bg-moss-500/12 text-moss-600 border-moss-500/25"
      : status.tone === "warn"
        ? "bg-[#b06a1a]/12 text-[#8a5214] border-[#b06a1a]/25"
        : status.tone === "down"
          ? "bg-clay-500/12 text-clay-600 border-clay-500/25"
          : "bg-ink-900/5 text-ink-700/60 border-ink-900/10";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {status.text}
    </span>
  );
}

function SegmentedControl({ value, onChange, tabs }) {
  return (
    <div
      role="tablist"
      aria-label="Curricular performance view"
      className="inline-flex flex-wrap rounded-lg border border-ink-900/12 bg-paper/70 p-1 gap-0.5"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition min-h-[2.25rem] ${
              active
                ? "bg-moss-500 text-white shadow-sm"
                : "text-ink-700/70 hover:text-ink-900 hover:bg-white/70"
            }`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({ to, title, average, passRate, enrollment, status, meta }) {
  const body = (
    <div className="h-full rounded-xl border border-ink-900/10 bg-white/55 p-3.5 sm:p-4 transition group-hover:border-moss-500/40 group-hover:bg-white/80">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-serif text-lg leading-tight truncate group-hover:underline">{title}</div>
          {meta && <div className="mt-0.5 text-[11px] text-ink-700/50 truncate">{meta}</div>}
        </div>
        <StatusPill status={status} />
      </div>
      <div className="mb-2.5">
        <div className="flex items-baseline justify-between gap-2 text-sm mb-1.5">
          <span className="text-ink-700/60">Cohort average</span>
          <span className="tabular-nums font-semibold text-ink-900">{average != null ? `${average}%` : "—"}</span>
        </div>
        <BarTrack value={average} color="#3d6b4f" />
      </div>
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-ink-900/8">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-700/45">Pass rate</div>
          <div className="mt-0.5 text-sm tabular-nums font-medium">{passRate != null ? `${passRate}%` : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-700/45">Students</div>
          <div className="mt-0.5 text-sm tabular-nums font-medium">{enrollment != null ? enrollment : "—"}</div>
        </div>
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block group h-full">
      {body}
    </Link>
  ) : (
    <div className="h-full">{body}</div>
  );
}

function DivisionRow({ row }) {
  return (
    <Link
      to={row.to}
      className="flex items-center gap-3 rounded-lg border border-ink-900/8 bg-white/45 px-3 py-2.5 hover:bg-white/80 hover:border-moss-500/30 transition group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium group-hover:underline truncate">{row.label}</span>
          <StatusPill status={row.status} />
        </div>
        <div className="mt-1.5">
          <BarTrack value={row.average} color="#3d6b4f" />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm tabular-nums font-semibold">{row.average != null ? `${row.average}%` : "—"}</div>
        <div className="text-[11px] text-ink-700/50 tabular-nums">
          {row.passRate != null ? `${row.passRate}% pass` : "—"} · {row.enrollment ?? "—"}
        </div>
      </div>
    </Link>
  );
}

function SubjectRow({ row }) {
  return (
    <Link
      to={row.to}
      className="block rounded-lg border border-ink-900/8 bg-white/45 px-3 py-2.5 hover:bg-white/80 hover:border-moss-500/30 transition group"
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <div className="text-sm font-medium group-hover:underline truncate">{row.label}</div>
          {row.meta && <div className="text-[11px] text-ink-700/50 truncate mt-0.5">{row.meta}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm tabular-nums font-semibold">{row.average != null ? `${row.average}%` : "—"}</div>
          <div className="text-[11px] text-ink-700/50 tabular-nums">
            {row.passRate != null ? `${row.passRate}% pass` : "—"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <BarTrack value={row.average} />
        </div>
        <StatusPill status={row.status} />
      </div>
    </Link>
  );
}

/**
 * Unified Class / Division / Subject viewport for the Principal desk.
 * Replaces stacked progress-bar lists with a segmented modular hub.
 */
export default function CurricularPerformanceHub({
  classWise = [],
  sections = [],
  subjectWise = [],
  teachers = [],
  schoolAverage,
  detailLoading = false,
}) {
  const [tab, setTab] = useState("class");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("average");

  const facultyBySubject = useMemo(() => {
    const map = new Map();
    for (const row of teachers) {
      if (!row?.subject) continue;
      const key = row.subject;
      if (!map.has(key)) map.set(key, new Set());
      if (row.teacher) map.get(key).add(row.teacher);
    }
    return map;
  }, [teachers]);

  const classRows = useMemo(
    () =>
      (classWise || []).map((s) => ({
        id: s.className,
        label: s.label || `Class ${s.className}`,
        average: s.average,
        passRate: s.passRate,
        enrollment: s.studentCount,
        status: benchmarkStatus(s.average, schoolAverage),
        meta: s.sectionCount != null ? `${s.sectionCount} division${s.sectionCount === 1 ? "" : "s"}` : undefined,
        to: paths.classGroup(s.className),
        searchText: [s.label, s.className, "class"].filter(Boolean).join(" "),
      })),
    [classWise, schoolAverage]
  );

  const divisionRows = useMemo(
    () =>
      (sections || []).map((s) => ({
        id: s.id,
        label: s.label,
        average: s.average,
        passRate: s.passRate,
        enrollment: s.studentCount,
        status: benchmarkStatus(s.average, schoolAverage),
        to: paths.classSection(s.id),
        searchText: [s.label, s.className, s.section].filter(Boolean).join(" "),
      })),
    [sections, schoolAverage]
  );

  const subjectRows = useMemo(
    () =>
      (subjectWise || []).map((s) => {
        const faculty = [...(facultyBySubject.get(s.name) || [])];
        return {
          id: s.name,
          label: s.name,
          average: s.average,
          passRate: s.passRate,
          enrollment: s.count,
          status: benchmarkStatus(s.average, schoolAverage),
          meta: faculty.length ? faculty.slice(0, 3).join(" · ") : undefined,
          to: paths.subjectByName(s.name),
          searchText: [s.name, ...faculty].filter(Boolean).join(" "),
        };
      }),
    [subjectWise, schoolAverage, facultyBySubject]
  );

  const sourceRows = tab === "class" ? classRows : tab === "division" ? divisionRows : subjectRows;
  const visible = useMemo(() => sortHubRows(filterHubRows(sourceRows, query), sortBy), [sourceRows, query, sortBy]);

  const emptyMessage = detailLoading
    ? tab === "class"
      ? "Loading classes…"
      : tab === "division"
        ? "Loading divisions…"
        : "Loading subjects…"
    : tab === "class"
      ? "No class groups yet."
      : tab === "division"
        ? "No divisions yet."
        : "No subject averages yet.";

  const moreLink =
    tab === "class" ? (
      <Link className="text-xs underline text-ink-700/60" to="/analysis/classes">
        All classes
      </Link>
    ) : tab === "subject" ? (
      <Link className="text-xs underline text-ink-700/60" to="/analysis/subjects">
        All subjects
      </Link>
    ) : null;

  return (
    <Panel className="mb-4" title="Curricular performance" action={moreLink}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <SegmentedControl value={tab} onChange={setTab} tabs={HUB_TABS} />
        <p className="text-xs text-ink-700/55 sm:text-right max-w-sm">
          Compare standards, divisions, and subjects against the school average without scrolling stacked lists.
        </p>
      </div>

      <TableToolbar
        q={query}
        setQ={setQuery}
        placeholder="Search standard, division, or faculty…"
        matched={visible.length}
        total={sourceRows.length}
        className="mb-4"
      >
        <label className="inline-flex items-center gap-1.5 text-xs text-ink-700/60 shrink-0">
          <span className="whitespace-nowrap">Sort by</span>
          <select
            className="field-filter !min-w-[9.5rem]"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort curricular rows"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </TableToolbar>

      {!sourceRows.length ? (
        <EmptyNote>{emptyMessage}</EmptyNote>
      ) : !visible.length ? (
        <EmptyNote>No matches for “{query.trim()}”.</EmptyNote>
      ) : tab === "class" ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visible.map((row) => (
            <MetricCard
              key={row.id}
              to={row.to}
              title={row.label}
              average={row.average}
              passRate={row.passRate}
              enrollment={row.enrollment}
              status={row.status}
              meta={row.meta}
            />
          ))}
        </div>
      ) : tab === "division" ? (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {visible.map((row) => (
            <DivisionRow key={row.id} row={row} />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2.5">
          {visible.map((row) => (
            <SubjectRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </Panel>
  );
}
