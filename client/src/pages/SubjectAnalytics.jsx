import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";

export default function SubjectAnalytics() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(eid) {
    const res = await api(`/api/analytics/subject/${id}${eid ? `?examId=${eid}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, [id]);

  if (!data) return <p>Loading subject…</p>;
  if (data.empty) return <p>No data for this subject yet.</p>;

  return (
    <div>
      <PageHeader
        title={data.subject.name}
        subtitle={`Class ${data.subject.className} · ${data.exam.name}`}
        actions={
          <select className="field w-auto" value={examId} onChange={(e) => load(e.target.value)}>
            {(data.exams || []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        }
      />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="font-serif text-lg mb-3">Average by section</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.classAvgs}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="average" fill="#1b2437" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-4 overflow-x-auto">
          <h3 className="font-serif text-lg mb-3">Teacher comparison</h3>
          <PaginatedTable items={data.teacherCompare} empty="No teacher comparison yet.">
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Class</th>
                    <th>Average</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((row, i) => (
                    <tr key={i}>
                      <td>{row.teacher}</td>
                      <td>{row.classLabel}</td>
                      <td>{row.average ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </div>
      </div>
    </div>
  );
}
