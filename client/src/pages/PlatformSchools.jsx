import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { useToast } from "../components/Toast.jsx";
import { NAV_TITLES } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function statusClass(status) {
  return status === "SUSPENDED" ? "status-badge status-badge-rejected" : "status-badge status-badge-active";
}

export default function PlatformSchools() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [schools, setSchools] = useState([]);
  const status = params.get("status") || "";
  const { q, setQ, filtered } = useTableSearch(schools, {
    getSearchText: (s) => searchHaystack(s.name, s.slug, s.board, s.affiliationNo, s.email, s.status),
  });

  useEffect(() => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    api(`/api/platform/schools${query}`)
      .then((data) => setSchools(Array.isArray(data) ? data : data.items || []))
      .catch((err) => toast.error(err.message || "Could not load schools"));
  }, [status, toast]);

  function setStatus(next) {
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set("status", next);
    else nextParams.delete("status");
    setParams(nextParams, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.platformSchools}
        subtitle="Create campuses, open a school to edit its profile, or suspend sign-in for that campus"
        actions={
          <Link to="/platform/schools/new" className="btn-accent">
            Add school
          </Link>
        }
      />
      <TableToolbar q={q} setQ={setQ} placeholder="Search schools…" matched={filtered.length} total={schools.length}>
        <select className="field-filter" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </TableToolbar>
      <div className="card overflow-x-auto mt-3">
        <table className="table">
          <thead>
            <tr>
              <th>School</th>
              <th>Code</th>
              <th>Board</th>
              <th>Status</th>
              <th>Staff</th>
              <th>Students</th>
              <th>Classes</th>
              <th>Principals</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((school) => (
              <tr key={school.id}>
                <td>
                  <Link to={`/platform/schools/${school.id}`} className="font-medium hover:underline">
                    {school.name}
                  </Link>
                  {school.email && <div className="text-xs text-ink-700/55">{school.email}</div>}
                </td>
                <td className="font-mono text-xs">{school.slug}</td>
                <td>{school.board || "—"}</td>
                <td>
                  <span className={statusClass(school.status)}>{school.status === "SUSPENDED" ? "Suspended" : "Active"}</span>
                </td>
                <td>{school.staffCount ?? "—"}</td>
                <td>{school.studentCount ?? "—"}</td>
                <td>{school.classCount ?? "—"}</td>
                <td>{school.principalCount ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="text-ink-700/60 py-8 text-center">
                  {schools.length ? "No schools match this search." : "No schools yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
