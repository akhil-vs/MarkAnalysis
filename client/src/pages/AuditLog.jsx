import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { describeAuditValue } from "../lib/markCodes.js";
import { NAV_TITLES } from "../lib/nav.js";
import { canViewAllAudits } from "../lib/roles.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

const ROLE_LABEL = {
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam coordinator",
  TEACHER: "Teacher",
};

const AUDIT_FILTERS = [
  { key: "role", match: (r, v) => r.actor?.role === v },
  { key: "actorId", match: (r, v) => r.actor?.id === v },
];

function auditSearchText(r) {
  return searchHaystack(
    r.actor?.name,
    r.actor?.role,
    r.actor?.roleLabel,
    r.actionLabel,
    r.summary,
    r.student?.rollNo,
    r.student?.name,
    r.subject?.name,
    r.exam?.name,
    r.oldLabel,
    r.newLabel,
    describeAuditValue(r.oldValue),
    describeAuditValue(r.newValue)
  );
}

function normalizeAuditPayload(data) {
  if (Array.isArray(data)) {
    const rows = data.map((r) => ({
      id: r.id,
      source: "mark",
      timestamp: r.timestamp,
      action: r.newValue === -1 ? "MARK_DELETED" : "MARK_CHANGED",
      actionLabel: r.newValue === -1 ? "Mark deleted" : "Mark edited",
      summary: "",
      actor: r.changedBy
        ? {
            id: r.changedBy.id,
            name: r.changedBy.name,
            role: r.changedBy.role,
            roleLabel: ROLE_LABEL[r.changedBy.role] || r.changedBy.role,
          }
        : null,
      exam: r.mark?.exam || null,
      student: r.mark?.student || null,
      subject: r.mark?.subject || null,
      oldValue: r.oldValue,
      newValue: r.newValue,
      oldLabel: describeAuditValue(r.oldValue) ?? "—",
      newLabel: describeAuditValue(r.newValue) ?? "—",
    }));
    return {
      scope: "teachers",
      rows,
      total: rows.length,
      page: 1,
      pageSize: rows.length || 50,
      pageCount: 1,
    };
  }
  const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.items) ? data.items : [];
  const total = Number(data?.total);
  const page = Number(data?.page) || 1;
  const pageSize = Number(data?.pageSize) || rows.length || 50;
  const pageCount =
    Number(data?.pageCount) ||
    Math.max(1, Math.ceil((Number.isFinite(total) ? total : rows.length) / pageSize));
  return {
    scope: data?.scope || "teachers",
    rows,
    total: Number.isFinite(total) ? total : rows.length,
    page,
    pageSize,
    pageCount,
  };
}

function roleChipClass(role) {
  if (role === "PRINCIPAL") return "mark-chip mark-chip-approved";
  if (role === "EXAM_COORDINATOR") return "mark-chip mark-chip-submitted";
  return "mark-chip mark-chip-empty";
}

export default function AuditLog() {
  const { user } = useAuth();
  const seeAllUsers = canViewAllAudits(user.role);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [exams, setExams] = useState([]);
  const [staff, setStaff] = useState([]);
  const [examId, setExamId] = useState("");
  const [scope, setScope] = useState(seeAllUsers ? "all-users" : "teachers");
  const table = useTableSearch(rows, { getSearchText: auditSearchText, filterDefs: AUDIT_FILTERS });

  const staffOptions = useMemo(() => {
    const seen = new Map();
    for (const u of staff) seen.set(u.id, u);
    for (const r of rows) {
      if (r.actor?.id && !seen.has(r.actor.id)) seen.set(r.actor.id, r.actor);
    }
    return [...seen.values()].sort((a, b) => String(a.name).localeCompare(b.name));
  }, [staff, rows]);

  async function load(id = examId) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (id) params.set("examId", id);
    if (table.q) params.set("q", table.q);
    if (table.filters.role) params.set("role", table.filters.role);
    if (table.filters.actorId) params.set("actorId", table.filters.actorId);
    const data = normalizeAuditPayload(await api(`/api/marks/audit?${params}`));
    setScope(data.scope);
    setRows(data.rows);
    setTotal(data.total ?? data.rows.length);
    setPageCount(data.pageCount ?? 1);
  }

  useEffect(() => {
    api("/api/exams").then((e) => {
      setExams(e);
      if (seeAllUsers) setExamId("");
      else if (e[0]) setExamId(e.at(-1).id);
    });
    if (seeAllUsers) {
      api("/api/users").then((u) => setStaff(Array.isArray(u) ? u : u.items || [])).catch(() => setStaff([]));
    }
  }, [seeAllUsers]);

  useEffect(() => {
    load(examId).catch(() => {});
  }, [page, pageSize, table.q, table.filters.role, table.filters.actorId, examId]);

  const subtitle = seeAllUsers
    ? "Every staff action, including exam coordinator approvals and edits"
    : "Teacher mark changes for the selected exam";

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.audit}
        subtitle={subtitle}
        actions={
          <select
            className="field-filter"
            value={examId}
            onChange={(e) => {
              setPage(1);
              setExamId(e.target.value);
            }}
          >
            <option value="">All activity</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} {e.academicYear ? `· ${e.academicYear}` : ""}
              </option>
            ))}
          </select>
        }
      />
      <div className="card">
        <div className="p-3 border-b border-ink-900/10">
          <TableToolbar
            q={table.q}
            setQ={(value) => {
              setPage(1);
              table.setQ(value);
            }}
            placeholder="Search staff, action, student, or subject"
            matched={total}
            total={total}
          >
            {seeAllUsers && (
              <select
                className="field-filter"
                value={table.filters.role || ""}
                onChange={(e) => {
                  setPage(1);
                  table.setFilter("role", e.target.value);
                }}
                aria-label="Filter by role"
              >
                <option value="">All roles</option>
                <option value="TEACHER">Teacher</option>
                <option value="EXAM_COORDINATOR">Exam coordinator</option>
                <option value="PRINCIPAL">Principal</option>
              </select>
            )}
            {seeAllUsers && (
              <select
                className="field-filter"
                value={table.filters.actorId || ""}
                onChange={(e) => {
                  setPage(1);
                  table.setFilter("actorId", e.target.value);
                }}
                aria-label="Filter by staff"
              >
                <option value="">All staff</option>
                {staffOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.role ? ` · ${ROLE_LABEL[u.role] || u.role}` : ""}
                  </option>
                ))}
              </select>
            )}
          </TableToolbar>
        </div>
        <PaginatedTable
          items={rows}
          server={{
            page,
            setPage,
            pageSize,
            setPageSize: (n) => {
              setPageSize(n);
              setPage(1);
            },
            total,
            pageCount,
          }}
          resetKey={`${examId}:${scope}:${table.q}:${table.filters.role || ""}:${table.filters.actorId || ""}`}
          empty={examId ? "No activity recorded for this exam yet." : "No activity recorded yet."}
        >
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Old</th>
                  <th>New</th>
                </tr>
              </thead>
              <tbody>
                {page.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.timestamp).toLocaleString()}</td>
                    <td>
                      <div className="font-medium text-ink-900">{r.actor?.name || "—"}</div>
                      {r.actor?.role && (
                        <span className={`${roleChipClass(r.actor.role)} mt-1`}>
                          {r.actor.roleLabel || ROLE_LABEL[r.actor.role] || r.actor.role}
                        </span>
                      )}
                    </td>
                    <td>{r.actionLabel || r.action}</td>
                    <td>
                      {r.source === "mark" ? (
                        <div>
                          <div className="text-sm">
                            {r.student ? `${r.student.rollNo} ${r.student.name}` : "—"}
                          </div>
                          <div className="text-xs text-ink-700/55">
                            {[r.subject?.name, r.exam?.name].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm">{r.summary}</div>
                      )}
                    </td>
                    <td>{r.source === "mark" ? (r.oldLabel ?? "—") : "—"}</td>
                    <td>{r.source === "mark" ? (r.newLabel ?? "—") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </div>
    </div>
  );
}