import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import {
  BarTrack,
  ChartTooltip,
  DashboardHero,
  EmptyNote,
  Metric,
  Panel,
  greeting,
} from "../components/DashboardKit.jsx";

export default function CoordinatorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");

  async function load(id) {
    const res = await api(`/api/analytics/coordinator${id ? `?examId=${id}` : ""}`);
    setData(res);
    if (res.exam) setExamId(res.exam.id);
  }

  useEffect(() => {
    load("");
  }, []);

  const strongestPair = useMemo(() => {
    const list = [...(data?.correlations || [])].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return list[0] || null;
  }, [data]);

  if (!data) return <p className="text-ink-700/60">Loading coordinator view…</p>;
  if (data.empty) return <p>No exam data yet.</p>;

  const pending = (data.pendingUploads?.teachers || []).filter((t) => t.pending);
  const difficulty = data.difficulty || [];
  const hardest = difficulty[0];
  const easiest = [...difficulty].reverse().find((d) => d.average != null) || difficulty.at(-1);
  const teacherRows = [...(data.teacherBySubject || [])].sort((a, b) => (a.average ?? 999) - (b.average ?? 999));

  return (
    <div>
      <DashboardHero
        kicker="Exam coordination"
        title={greeting(user.name)}
        subtitle={`${data.exam.name} is the working exam. ${pending.length} teacher${pending.length === 1 ? "" : "s"} still have empty registers.`}
        actions={
          <select className="field w-auto" value={examId} onChange={(e) => load(e.target.value)}>
            {(data.exams || []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric
          label="Teachers pending upload"
          value={data.pendingUploads?.pendingTeacherCount ?? 0}
          to="/pending-uploads"
          tone={pending.length ? "alert" : undefined}
          hint={{ text: pending.length ? "Open the upload queue" : "All registers in", tone: pending.length ? "down" : "up" }}
        />
        <Metric label="Draft marks" value={data.pendingDrafts} hint={{ text: "Saved but not approved", tone: "flat" }} />
        <Metric
          label="Hardest subject"
          value={hardest?.name || "—"}
          hint={hardest ? { text: `${hardest.average ?? "—"}% average`, tone: "down" } : null}
        />
        <Metric
          label="Most linked pair"
          value={strongestPair ? `${strongestPair.a} / ${strongestPair.b}` : "—"}
          hint={strongestPair ? { text: `r = ${strongestPair.r}`, tone: "flat" } : null}
        />
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <Panel
          className="lg:col-span-5"
          title="Upload queue"
          action={<Link className="text-xs underline text-ink-700/60" to="/pending-uploads">Full list</Link>}
        >
          {pending.length ? (
            <div className="space-y-4">
              {pending.map((t) => {
                const holes = t.assignments.filter((a) => a.missing > 0);
                return (
                  <div key={t.teacherId}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-clay-600 text-xs">{holes.length} register{holes.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="text-[11px] text-ink-700/55">
                      {holes.map((a) => `${a.classLabel} ${a.subject} (${a.uploaded}/${a.expected})`).join(" · ")}
                    </div>
                  </div>
                );
              })}
              <Link className="btn-accent mt-2" to="/marks">Open mark register</Link>
            </div>
          ) : (
            <EmptyNote>Every assigned teacher has uploaded for this exam. You can approve drafts from the register.</EmptyNote>
          )}
        </Panel>

        <Panel
          className="lg:col-span-7"
          title="Subject difficulty"
          action={<Link className="text-xs underline text-ink-700/60" to="/analysis/subjects">Subject analysis</Link>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={difficulty} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="average" name="Average" radius={[0, 4, 4, 0]}>
                {difficulty.map((d, i) => (
                  <Cell key={d.name} fill={i === 0 ? "#c45c26" : i === difficulty.length - 1 ? "#3d6b4f" : "#1b2437"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {easiest && hardest && easiest.name !== hardest.name && (
            <p className="mt-2 text-xs text-ink-700/60">
              {hardest.name} is the steepest paper. {easiest.name} is holding the highest average.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-7" title="Teacher comparison">
          <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
            {teacherRows.map((row, i) => (
              <div key={`${row.teacher}-${row.classLabel}-${row.subject}`}>
                <div className="flex items-baseline justify-between text-sm mb-1">
                  <span>
                    <span className="font-medium">{row.teacher}</span>
                    <span className="text-ink-700/50 text-xs ml-2">{row.subject} · {row.classLabel}</span>
                  </span>
                  <span className="tabular-nums text-ink-700/70">{row.average ?? "—"}% · {row.passRate ?? "—"} pass</span>
                </div>
                <BarTrack value={row.average ?? 0} color={i < 2 && row.average != null ? "#c45c26" : "#1b2437"} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="lg:col-span-5" title="Subject correlations">
          <p className="text-xs text-ink-700/55 mb-3">
            A high positive r means students who struggle in one subject tend to struggle in the other.
          </p>
          <div className="space-y-3">
            {[...data.correlations].sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).map((c) => (
              <div key={`${c.a}-${c.b}`}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{c.a} × {c.b}</span>
                  <span className="tabular-nums">{c.r}</span>
                </div>
                <BarTrack value={Math.abs(c.r) * 100} color={c.r < 0 ? "#c45c26" : "#3d6b4f"} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
