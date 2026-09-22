import { Link } from "react-router-dom";
import { PaginatedTable } from "./PaginatedTable.jsx";
import {
  avatarTone,
  classRomanBadge,
  classSectionStatus,
  classTierLabel,
  initials,
  rosterBarTone,
  rosterCapacity,
  sectionPillTone,
  sectionsByClassName,
} from "../lib/classRecordPresentation.js";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 7h14" strokeLinecap="round" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" strokeLinecap="round" />
      <path d="M8 7l.8 11.2A1.5 1.5 0 0 0 10.3 19.5h3.4a1.5 1.5 0 0 0 1.5-1.3L16 7" strokeLinecap="round" />
    </svg>
  );
}

export default function ClassRecordsTable({
  rows,
  allRows,
  table,
  busy,
  loading,
  onEdit,
  onDelete,
  onExport,
  onPresetNeedsFaculty,
}) {
  const sectionMap = sectionsByClassName(allRows);
  const gradeLevelCount = new Set(allRows.map((r) => r.className).filter(Boolean)).size;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 sm:px-4 py-3 border-b border-ink-900/10 bg-white/50">
        <div>
          <h3 className="font-serif text-lg text-ink-900">Registered class sections</h3>
          <p className="text-xs text-ink-700/55 mt-0.5">Filter, export, and manage divisions and class teachers.</p>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45">Class levels</dt>
            <dd className="font-medium text-ink-900">{gradeLevelCount} active</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-700/45">Total divisions</dt>
            <dd className="font-medium text-ink-900">{allRows.length} sections</dd>
          </div>
        </dl>
      </div>
      <div className="p-3 sm:p-4 border-b border-ink-900/10 bg-paper/40">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative grow basis-full sm:basis-auto sm:grow sm:max-w-md min-w-0">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-ink-700/45">
              <SearchIcon />
            </span>
            <input
              type="search"
              className="field w-full !pl-9"
              placeholder="Search by class, section, or teacher…"
              value={table.q}
              onChange={(e) => table.setQ(e.target.value)}
              aria-label="Search by class, section, or teacher"
            />
          </div>
          <select
            className="field-filter"
            value={table.filters.className || ""}
            onChange={(e) => table.setFilter("className", e.target.value)}
            aria-label="Filter by class"
          >
            <option value="">All classes</option>
            {[...new Set(allRows.map((r) => r.className).filter(Boolean))]
              .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
              .map((c) => (
                <option key={c} value={c}>
                  Class {c}
                </option>
              ))}
          </select>
          <select
            className="field-filter"
            value={table.filters.teacher || ""}
            onChange={(e) => table.setFilter("teacher", e.target.value)}
            aria-label="Filter by class teacher"
          >
            <option value="">All teachers</option>
            <option value="assigned">Has class teacher</option>
            <option value="unassigned">No class teacher</option>
          </select>
          <select
            className="field-filter"
            value={table.filters.status || ""}
            onChange={(e) => table.setFilter("status", e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="roster_open">Roster open</option>
            <option value="at_capacity">At capacity</option>
            <option value="needs_faculty">Needs faculty</option>
          </select>
          <button type="button" className="btn-ghost shrink-0" onClick={onExport} disabled={busy || !rows.length}>
            Export CSV
          </button>
          <button type="button" className="btn-ghost shrink-0" onClick={onPresetNeedsFaculty} disabled={busy}>
            Filter preset
          </button>
        </div>
      </div>

      <PaginatedTable
        items={rows}
        resetKey={table.resetKey}
        empty="No class sections yet. Register a class above."
        itemLabel="class sections"
        busy={busy || loading}
        busyLabel={loading ? "Loading classes…" : "Updating classes…"}
      >
        {(pageItems) => (
          <table className="table min-w-[56rem]">
            <thead>
              <tr>
                <th>Grade level &amp; standard</th>
                <th>Division / section</th>
                <th>Assigned class teacher</th>
                <th>Roster enrollment</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => {
                const siblings = sectionMap.get(String(row.className || "")) || [row];
                const students = row._count?.students ?? 0;
                const { cap, pct } = rosterCapacity(students);
                const status = classSectionStatus(row);
                const teacher = row.classTeacher;

                return (
                  <tr key={row.id}>
                    <td>
                      <div className="flex items-start gap-3 min-w-[11rem]">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-sm font-serif font-semibold text-cream shadow-sm">
                          {classRomanBadge(row.className)}
                        </span>
                        <div className="min-w-0 pt-0.5">
                          <div className="font-medium text-ink-900">Grade {row.className}</div>
                          <div className="text-xs text-ink-700/55 mt-0.5">{classTierLabel(row.className)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5 max-w-[12rem]">
                        {siblings.map((s) => {
                          const active = s.id === row.id;
                          const tone = sectionPillTone(s.section, s.className);
                          return (
                            <span
                              key={s.id}
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${
                                active ? tone : "bg-ink-900/4 text-ink-700/45 border-ink-900/8"
                              }`}
                              title={active ? "This row" : `Section ${s.section}`}
                            >
                              Sec {s.section}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      {teacher ? (
                        <div className="flex items-start gap-2.5 min-w-[10rem]">
                          <span
                            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarTone(teacher.id || teacher.name)}`}
                            aria-hidden="true"
                          >
                            {initials(teacher.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-ink-900 text-sm">{teacher.name}</div>
                            <div className="text-xs text-ink-700/50">Class teacher / homeroom</div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2.5 min-w-[10rem]">
                          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900/6 text-ink-700/35 text-xs">
                            —
                          </span>
                          <div>
                            <div className="text-sm font-medium text-ink-700/55">Unassigned lead</div>
                            <div className="text-xs text-ink-700/45">Pending assignment</div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="min-w-[9.5rem] max-w-[14rem]">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium text-ink-900">
                            {students} / {cap} students
                          </span>
                          <span className="text-xs text-ink-700/50">{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-900/8">
                          <div
                            className={`h-full rounded-full transition-all ${rosterBarTone(pct, Boolean(teacher))}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.className}`}>
                        <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${status.dotClass}`} aria-hidden="true" />
                        {status.label}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {teacher ? (
                          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onEdit(row)} disabled={busy}>
                            Edit
                          </button>
                        ) : (
                          <button type="button" className="btn-primary !px-2 !py-1 text-xs" onClick={() => onEdit(row)} disabled={busy}>
                            Assign lead
                          </button>
                        )}
                        <Link
                          className="btn-ghost !px-2 !py-1 text-xs inline-flex"
                          to={`/manage?tab=Students&classSectionId=${encodeURIComponent(row.id)}`}
                        >
                          Roster
                        </Link>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-700/55 hover:bg-clay-500/10 hover:text-clay-600 disabled:opacity-40"
                          aria-label={`Delete class ${row.className}-${row.section}`}
                          onClick={() => onDelete(row)}
                          disabled={busy}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </PaginatedTable>
    </div>
  );
}
