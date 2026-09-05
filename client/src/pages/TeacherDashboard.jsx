import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { ExamSelect, YearComparison } from "../components/AnalysisPanels.jsx";
import {
  BarTrack,
  DashboardHero,
  EmptyNote,
  Metric,
  Panel,
  RankRow,
  greeting,
} from "../components/DashboardKit.jsx";

const COLORS = ["#1b2437", "#c45c26", "#3d6b4f", "#7a5c3a"];

export default function TeacherDashboard() {
  const { user, assignments } = useAuth();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(id) {
    const res = await api(`/api/analytics/teacher${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, []);

  if (!data) return <p className="text-ink-700/60">Loading your classes…</p>;

  const registers = data.registers || [];
  const radar = registers.reduce((acc, row) => {
    let item = acc.find((x) => x.subject === row.subject);
    if (!item) {
      item = { subject: row.subject };
      acc.push(item);
    }
    item[row.classLabel] = row.average ?? 0;
    return acc;
  }, []);
  const keys = [...new Set(registers.map((r) => r.classLabel))];
  const subjectName = registers[0]?.subject || assignments[0]?.subject?.name || "your subject";

  return (
    <div>
      <DashboardHero
        kicker="Teacher desk"
        title={greeting(user.name)}
        subtitle={`${subjectName} across ${data.kpis?.sections ?? registers.length} section${(data.kpis?.sections ?? 0) === 1 ? "" : "s"}. ${data.exam?.name || "No exam"} is the current paper.`}
        actions={
          data.exams?.length ? (
            <ExamSelect exams={data.exams} value={examId} onChange={load} />
          ) : null
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric label="Your average" value={data.kpis?.average != null ? `${data.kpis.average}%` : "—"} />
        <Metric label="Students" value={data.kpis?.students ?? "—"} />
        <Metric label="Sections" value={data.kpis?.sections ?? "—"} />
        <Metric
          label="Registers to finish"
          value={data.kpis?.pendingRegisters ?? 0}
          tone={data.kpis?.pendingRegisters ? "alert" : undefined}
          to={user.id ? `/analysis/teachers/${user.id}` : undefined}
          hint={{
            text: data.kpis?.pendingRegisters ? "Marks still missing" : "All assigned rows entered",
            tone: data.kpis?.pendingRegisters ? "down" : "up",
          }}
        />
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <Panel className="lg:col-span-7" title="Your registers">
          <div className="grid sm:grid-cols-2 gap-3">
            {registers.map((r) => (
              <div key={r.id} className="rounded-xl border border-ink-900/10 bg-white/50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-serif text-2xl">{r.classLabel}</div>
                    <div className="text-xs text-ink-700/55">{r.subject}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-serif text-2xl">{r.average ?? "—"}</div>
                    <div className="text-[11px] text-ink-700/50">{r.passRate}% pass</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-ink-700/50 mb-1">
                    <span>{r.statusLabel || (r.provisional ? "Draft — awaiting approval" : "Marks entered")}</span>
                    <span>{r.uploaded} / {r.expected}</span>
                  </div>
                  <BarTrack
                    value={r.expected ? (r.uploaded / r.expected) * 100 : 0}
                    color={r.missing ? "#c45c26" : r.provisional || r.status === "AWAITING_APPROVAL" ? "#b45309" : "#3d6b4f"}
                  />
                </div>
                <div className="mt-3 flex gap-3 text-xs">
                  <Link className="underline" to={`/classes/${r.classSectionId}`}>Class view</Link>
                  <Link className="underline" to={`/marks?classSectionId=${r.classSectionId}&subjectId=${r.subjectId}`}>
                    {r.missing ? "Finish register" : r.provisional || r.status === "AWAITING_APPROVAL" ? "Saved as draft" : "Mark register"}
                  </Link>
                </div>
              </div>
            ))}
            {!registers.length && <EmptyNote>No assignments yet. Ask the principal to assign your classes.</EmptyNote>}
          </div>
        </Panel>

        <Panel className="lg:col-span-5" title="Section strength">
          {radar.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radar}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <PolarRadiusAxis domain={[0, 100]} />
                {keys.map((k, i) => (
                  <Radar key={k} name={k} dataKey={k} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.14} />
                ))}
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyNote>No marks in your assignments for this exam yet.</EmptyNote>
          )}
        </Panel>
      </div>

      <div className="mb-4">
        <YearComparison series={data.yearComparison} title="Your registers versus previous years" />
      </div>

      <Panel title="Students to watch" action={<Link className="text-xs underline text-ink-700/60" to="/analysis/students">All your students</Link>}>
        {(data.watchlist || []).length ? (
          data.watchlist.map((s, i) => (
            <RankRow
              key={s.studentId}
              rank={i + 1}
              name={s.name}
              meta={`${s.rollNo}${s.declining ? " · slipping" : ""}${s.atRisk ? " · below 55%" : ""}`}
              value={s.latest != null ? `${s.latest}%` : "—"}
              to={`/students/${s.studentId}`}
            />
          ))
        ) : (
          <EmptyNote>No one in your sections is currently flagged as at risk or declining.</EmptyNote>
        )}
      </Panel>
    </div>
  );
}
