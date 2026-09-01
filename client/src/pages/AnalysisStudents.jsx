import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";

export default function AnalysisStudents() {
  const [students, setStudents] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    api("/api/students").then(setStudents);
  }, []);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return students;
    return students.filter((s) =>
      `${s.name} ${s.rollNo} ${s.classSection.className}${s.classSection.section}`.toLowerCase().includes(needle)
    );
  }, [students, q]);

  return (
    <div>
      <PageHeader title="Student analysis" subtitle="Search a student for trends, rank, and a report card" />
      <input
        className="field max-w-md mb-4"
        placeholder="Search name, roll, or class"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="card">
        <PaginatedTable items={rows} resetKey={q} empty="No matching students.">
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
                      <Link className="underline" to={`/students/${s.id}`}>Open analysis</Link>
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
