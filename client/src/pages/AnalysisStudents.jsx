import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { LoadError } from "../components/LoadError.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { LoadingState } from "../components/Spinner.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { NAV_TITLES, paths } from "../lib/nav.js";

export default function AnalysisStudents() {
  const [students, setStudents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q.trim()) params.set("q", q.trim());
    api(`/api/students?${params}`)
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setStudents(data);
          setTotal(data.length);
          setPageCount(1);
        } else {
          setStudents(data.items || []);
          setTotal(data.total || 0);
          setPageCount(data.pageCount || 1);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load students");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, q]);

  if (error) return <LoadError message={error} />;
  if (loading && !students.length) return <LoadingState label="Loading students…" />;

  return (
    <div>
      <PageHeader title={NAV_TITLES.analysisStudents} subtitle="Search a student for trends, rank, and a report card" />
      <div className="card">
        <div className="p-3 border-b border-ink-900/10">
          <TableToolbar
            q={q}
            setQ={(value) => {
              setQ(value);
              setPage(1);
            }}
            placeholder="Search name, roll, or class"
            matched={total}
            total={total}
          />
        </div>
        <PaginatedTable
          items={students}
          busy={loading}
          empty="No matching students."
          server={{
            page,
            setPage,
            pageCount,
            pageSize,
            setPageSize: (n) => {
              setPageSize(n);
              setPage(1);
            },
            total,
          }}
        >
          {(pageRows) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.rollNo}</td>
                    <td>{s.name}</td>
                    <td>
                      {s.classSection.className}-{s.classSection.section}
                    </td>
                    <td className="text-right">
                      <Link className="underline" to={paths.student(s.id)}>
                        Open analysis
                      </Link>
                    </td>
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
