import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyNote, Panel } from "./DashboardKit.jsx";
import { PaginatedTable } from "./PaginatedTable.jsx";
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

const TAB_HELP = {
  class: "One row per class, with every division combined. Class 6 includes 6-A, 6-B, and the rest.",
  division: "One row per division, such as 6-A. A division is a class section, not the school level at the top of the page.",
  subject: "One row per subject for the school level selected at the top of the page.",
};

function comparedWithAverage(average, schoolAverage) {
  if (average == null || Number.isNaN(Number(average))) {
    return { text: "Not scored yet", tone: "flat" };
  }
  if (schoolAverage == null || Number.isNaN(Number(schoolAverage))) {
    return { text: "School average not ready", tone: "flat" };
  }
  const diff = Math.round((Number(average) - Number(schoolAverage)) * 10) / 10;
  if (diff === 0) return { text: "Same as the school average", tone: "flat" };
  const sign = diff > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(diff)} points`,
    tone: diff > 0 ? "up" : "down",
  };
}

function SegmentedControl({ value, onChange, tabs }) {
  return (
    <div
      role="tablist"
      aria-label="Curricular performance view"
      className="inline-flex max-w-full flex-wrap rounded-lg border border-ink-900/12 bg-paper/70 p-1 gap-0.5"
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

function percent(value) {
  return value != null && value !== "" ? `${value}%` : "—";
}

/**
 * Class, division, and subject results for the principal desk.
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
      (classWise || []).map((row) => ({
        id: row.className,
        label: row.label || `Class ${row.className}`,
        average: row.average,
        passRate: row.passRate,
        enrollment: row.studentCount,
        sectionCount: row.sectionCount,
        status: benchmarkStatus(row.average, schoolAverage),
        to: paths.classGroup(row.className),
        searchText: [row.label, row.className, "class"].filter(Boolean).join(" "),
      })),
    [classWise, schoolAverage]
  );

  const divisionRows = useMemo(
    () =>
      (sections || []).map((row) => ({
        id: row.id,
        label: row.label,
        average: row.average,
        passRate: row.passRate,
        enrollment: row.studentCount,
        status: benchmarkStatus(row.average, schoolAverage),
        to: paths.classSection(row.id),
        searchText: [row.label, row.className, row.section].filter(Boolean).join(" "),
      })),
    [sections, schoolAverage]
  );

  const subjectRows = useMemo(
    () =>
      (subjectWise || []).map((row) => {
        const faculty = [...(facultyBySubject.get(row.name) || [])];
        return {
          id: row.name,
          label: row.name,
          average: row.average,
          passRate: row.passRate,
          enrollment: row.count,
          faculty,
          status: benchmarkStatus(row.average, schoolAverage),
          to: paths.subjectByName(row.name),
          searchText: [row.name, ...faculty].filter(Boolean).join(" "),
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

  const nameHeader = tab === "class" ? "Class" : tab === "division" ? "Division" : "Subject";
  const countHeader = tab === "class" ? "Divisions" : tab === "subject" ? "Scored marks" : "Students";

  return (
    <Panel className="mb-4" title="Curricular performance" action={moreLink}>
      <div className="mb-4 flex flex-col gap-3">
        <SegmentedControl value={tab} onChange={setTab} tabs={HUB_TABS} />
        <p className="max-w-3xl text-xs leading-relaxed text-ink-700/60">{TAB_HELP[tab]}</p>
      </div>

      <TableToolbar
        q={query}
        setQ={setQuery}
        placeholder="Search this table"
        matched={visible.length}
        total={sourceRows.length}
        className="mb-4"
      >
        <label className="inline-flex items-center gap-1.5 text-xs text-ink-700/60 shrink-0">
          <span className="whitespace-nowrap">Sort by</span>
          <select
            className="field-filter !min-w-[9.5rem]"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
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
      ) : (
        <PaginatedTable
          items={visible}
          pageSize={12}
          resetKey={`${tab}|${query}|${sortBy}`}
          itemLabel="rows"
          empty="No rows in this view."
        >
          {(rows) => (
            <table className="table table-cards w-full">
              <thead>
                <tr>
                  <th scope="col">{nameHeader}</th>
                  {tab === "class" && <th scope="col">Divisions</th>}
                  {tab === "subject" && <th scope="col">Teachers</th>}
                  <th scope="col">{tab === "class" ? "Students" : countHeader}</th>
                  <th scope="col">Average</th>
                  <th scope="col">Pass rate</th>
                  <th scope="col">Vs school average</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const versus = comparedWithAverage(row.average, schoolAverage);
                  const versusClass =
                    versus.tone === "up" ? "text-moss-600" : versus.tone === "down" ? "text-clay-600" : "text-ink-700/70";
                  return (
                    <tr key={row.id}>
                      <td data-label={nameHeader} className="align-top">
                        {row.to ? (
                          <Link className="font-medium hover:underline" to={row.to}>
                            {row.label}
                          </Link>
                        ) : (
                          <span className="font-medium">{row.label}</span>
                        )}
                      </td>
                      {tab === "class" && (
                        <td data-label="Divisions" className="align-top tabular-nums">
                          {row.sectionCount ?? "—"}
                        </td>
                      )}
                      {tab === "subject" && (
                        <td data-label="Teachers" className="align-top break-words">
                          {row.faculty?.length ? row.faculty.join(", ") : "—"}
                        </td>
                      )}
                      <td data-label={tab === "class" ? "Students" : countHeader} className="align-top tabular-nums">
                        {row.enrollment ?? "—"}
                      </td>
                      <td data-label="Average" className="align-top tabular-nums">
                        {percent(row.average)}
                      </td>
                      <td data-label="Pass rate" className="align-top tabular-nums">
                        {percent(row.passRate)}
                      </td>
                      <td data-label="Vs school average" className={`align-top ${versusClass}`}>
                        {versus.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      )}
    </Panel>
  );
}
