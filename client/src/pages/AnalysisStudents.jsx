import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { NAV_TITLES, paths } from "../lib/nav.js";
import { searchHaystack, useTableSearch } from "../lib/tableSearch.js";

function studentSearchText(s) {
  return searchHaystack(s.name, s.rollNo, s.classSection?.className, s.classSection?.section);
}

export default function AnalysisStudents() {
  const [students, setStudents] = useState([]);
  const table = useTableSearch(students, { getSearchText: studentSearchText });

  useEffect(() => {
    api("/api/students").then(setStudents);
  }, []);

  return (
    <div>
      <PageHeader title={NAV_TITLES.analysisStudents} subtitle="Search a student for trends, rank, and a report card" />
      <div className="card">
        <div className="p-3 border-b border-ink-900/10">
          <TableToolbar
            q={table.q}
            setQ={table.setQ}
            placeholder="Search name, roll, or class"
            matched={table.matched}
            total={table.total}
          />
        </div>
        <PaginatedTable items={table.filtered} resetKey={table.resetKey} empty="No matching students.">
          {(page) => (
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
                {page.map((s) => (
                  <tr key={s.id}>
                    <td>{s.rollNo}</td>
                    <td>{s.name}</td>
                    <td>{s.classSection.className}-{s.classSection.section}</td>
                    <td className="text-right">
                      <Link className="underline" to={paths.student(s.id)}>Open analysis</Link>
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
