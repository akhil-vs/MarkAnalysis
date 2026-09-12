import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, download } from "../api.js";
import { LoadError } from "../components/LoadError.jsx";
import { useAuth } from "../auth.jsx";
import { ExamSelect } from "../components/ExamSelect.jsx";
import { YearComparison } from "../components/AnalysisPanels.jsx";
import {
  BarTrack,
  ChartTooltip,
  DashboardHero,
  EmptyNote,
  GRADE_COLORS,
  Metric,
  Panel,
  RankRow,
  deltaLabel,
  greeting,
} from "../components/DashboardKit.jsx";
import PendingAccessRequests from "../components/PendingAccessRequests.jsx";
import PendingSubmittedApprovals from "../components/PendingSubmittedApprovals.jsx";
import NotifyTeachersDialog from "../components/NotifyTeachersDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { yearDelta } from "../lib/exams.js";
import { NAV_LABELS, paths } from "../lib/nav.js";

export default function PrincipalDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [examId, setExamId] = useState("");
  const [error, setError] = useState("");
  const [notify, setNotify] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load(id) {
    setError("");
    try {
      const base = new URLSearchParams();
      if (id) base.set("examId", id);
      base.set("include", "summary");
      const summary = await api(`/api/analytics/school?${base}`);
      setData(summary);
      setDetailLoading(false);
      if (summary.empty) return;
      if (summary.exam) setExamId(summary.exam.id);

      const detailQ = new URLSearchParams({
        examId: summary.exam.id,
        include: "detail",
      });
      setDetailLoading(true);
      try {
        const detail = await api(`/api/analytics/school?${detailQ}`);
        setData((prev) => ({ ...(prev || {}), ...detail }));
      } finally {
        setDetailLoading(false);
      }
    } catch (e) {
      setError(e.message || "Could not load school view");
    }
  }

  useEffect(() => {
    load("");
  }, []);

  const grades = useMemo(
    () => Object.entries(data?.gradeDist || {}).map(([grade, count]) => ({ grade, count })),
    [data]
  );

  const trendDelta = useMemo(() => {
    const points = data?.yearComparison?.length ? data.yearComparison : data?.termTrend || [];
    const current = points.find((p) => p.examId === examId) || points.at(-1);
    const idx = points.findIndex((p) => p.examId === current?.examId);
    const prev = idx > 0 ? points[idx - 1] : null;
    const yoy = yearDelta(data?.yearComparison, examId);
    if (yoy) {
      const sign = yoy.diff > 0 ? "+" : "";
      return {
        text: `${sign}${yoy.diff} vs ${yoy.prev.academicYear}`,
        tone: yoy.diff > 0 ? "up" : yoy.diff < 0 ? "down" : "flat",
      };
    }
    return deltaLabel(current?.average, prev?.average);
  }, [data, examId]);

  if (error) return <LoadError message={error} />;
  if (!data) return <p className="text-ink-700/60">Loading school view…</p>;
  if (data.empty) return <p>No exam data yet.</p>;

  const pending = (data.pendingUploads?.teachers || []).filter((t) => t.pending);
  const awaitingApproval = (data.pendingUploads?.teachers || []).filter((t) => t.awaitingApproval && !t.pending);
  const sections = [...(data.sectionAverages || [])].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const bestSection = sections[0];
  const teachers = [...(data.teacherPerf || [])].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const examPass = data.examPass || [];

  const deskLabel = location.pathname.startsWith("/analysis/school")
    ? NAV_LABELS.analysisSchool
    : user.role === "PRINCIPAL"
      ? "Principal desk"
      : "Exam coordination";

  return (
    <div>
      <DashboardHero
        kicker={deskLabel}
        title={greeting(user.name)}
        subtitle={`${data.exam.name} · ${data.exam.term}. School average ${data.kpis.schoolAverage ?? "—"}% across ${data.kpis.students} students.`}
        actions={
          <>
            <ExamSelect exams={data.exams} value={examId} onChange={load} />
            <Link className="btn-ghost" to="/analysis/deep">
              Deep insights
            </Link>
            <Link className="btn-ghost" to={`/consolidated?examId=${examId}`}>
              Consolidated lists
            </Link>
            <button
              className="btn-ghost"
              onClick={() =>
                download(`/api/exports/table.xlsx?examId=${examId}`, "marks.xlsx").catch((err) =>
                  toast.error(err.message || "Download failed")
                )
              }
            >
              Export Excel
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric label="School average" value={data.kpis.schoolAverage != null ? `${data.kpis.schoolAverage}%` : "—"} hint={trendDelta} />
        <Metric
          label="Pass rate"
          value={data.kpis.passRate != null ? `${data.kpis.passRate}%` : "—"}
          hint={{ text: `${data.kpis.students} students on roll`, tone: "flat" }}
        />
        <Metric
          label="Distinction / fail"
          value={`${data.boardSummary?.distinction ?? 0} / ${data.boardSummary?.fail ?? 0}`}
          hint={{
            text: `≥${data.boardSummary?.distinctionMin ?? 90}% · <${data.boardSummary?.passPercent ?? 50}%`,
            tone: "flat",
          }}
        />
        <Metric
          label="Registers approved"
          value={data.readiness?.kpis?.approvedPct != null ? `${data.readiness.kpis.approvedPct}%` : "—"}
          to="/analysis/deep?tab=readiness"
          tone={data.readiness?.kpis?.breached ? "alert" : undefined}
          hint={{
            text: data.readiness?.pastDeadline
              ? `${data.readiness.kpis?.breached ?? 0} past deadline incomplete`
              : `${data.readiness?.kpis?.awaiting ?? 0} awaiting approval`,
            tone: data.readiness?.kpis?.breached ? "down" : "flat",
          }}
        />
      </div>

      {detailLoading && (
        <p className="mb-4 text-sm text-ink-700/55" role="status">
          Loading charts and rankings…
        </p>
      )}

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <PendingSubmittedApprovals className="lg:col-span-12" />
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <PendingAccessRequests className="lg:col-span-12" />
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <Panel
          className="lg:col-span-5"
          title="Needs attention"
          action={
            <div className="flex flex-wrap gap-2">
              {(pending.length > 0 || awaitingApproval.length > 0) && (
                <button
                  type="button"
                  className="text-xs underline text-ink-700/60"
                  onClick={() =>
                    setNotify({
                      kind: pending.length ? "INCOMPLETE" : "DEADLINE",
                      examId,
                      audience: pending.length ? "PENDING" : "ALL",
                      exams: data.exams,
                    })
                  }
                >
                  Notify teachers
                </button>
              )}
              <Link className="text-xs underline text-ink-700/60" to={paths.pendingUploads()}>
                Upload status
              </Link>
            </div>
          }
        >
          {pending.length || awaitingApproval.length ? (
            <div className="space-y-3">
              {awaitingApproval.map((t) => (
                <div key={`await-${t.teacherId}`} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-[11px] text-ink-700/50">
                      {t.assignments
                        .filter(
                          (a) =>
                            a.status === "AWAITING_APPROVAL" ||
                            ((a.submitted ?? 0) > 0 && (a.approved ?? 0) < a.expected)
                        )
                        .map((a) => `${a.classLabel} ${a.subject}`)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="text-xs text-clay-600 whitespace-nowrap">Awaiting approval</div>
                </div>
              ))}
              {pending.map((t) => (
                <div key={t.teacherId} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-[11px] text-ink-700/50">
                      {t.assignments.filter((a) => a.missing > 0).map((a) => `${a.classLabel} ${a.subject}`).join(" · ")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-xs text-clay-600 whitespace-nowrap">{t.missingAssignments} left</div>
                    <button
                      type="button"
                      className="text-[11px] underline text-ink-700/55"
                      onClick={() =>
                        setNotify({
                          kind: "INCOMPLETE",
                          examId,
                          audience: "SELECTED",
                          teacherIds: [t.teacherId],
                          teacherName: t.name,
                          exams: data.exams,
                        })
                      }
                    >
                      Notify
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyNote>No missing registers for this exam.</EmptyNote>
          )}
          {data.atRisk?.length > 0 && (
            <div className="mt-5 pt-4 border-t border-ink-900/10">
              <div className="text-[11px] uppercase tracking-wider text-ink-700/50 mb-2">
                Students below {data.boardSummary?.passPercent ?? 50}%
              </div>
              {data.atRisk.slice(0, 4).map((s, i) => (
                <RankRow
                  key={s.studentId}
                  rank={i + 1}
                  name={s.name}
                  meta={s.classLabel}
                  value={`${s.average}%`}
                  grade={s.grade}
                  to={paths.student(s.studentId)}
                />
              ))}
              {data.atRisk.length === 0 && <EmptyNote>No students currently at risk.</EmptyNote>}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-7" title="How the school is moving">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.termTrend}>
              <defs>
                <linearGradient id="avgFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3d6b4f" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3d6b4f" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="examName" tick={{ fontSize: 12 }} />
              <YAxis domain={[40, 100]} tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="average" name="Average" stroke="#3d6b4f" fill="url(#avgFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-700/60">
            {examPass.map((e) => (
              <span key={e.examId}>
                {e.label || e.name}: <span className="text-ink-900 font-medium">{e.passRate}% pass</span>
              </span>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <Panel className="lg:col-span-5" title="Class-wise" action={<Link className="text-xs underline text-ink-700/60" to="/analysis/classes">All classes</Link>}>
          <div className="space-y-4">
            {(data.classWise || []).map((s) => (
              <Link key={s.className} to={paths.classGroup(s.className)} className="block group">
                <div className="flex items-baseline justify-between text-sm mb-1.5">
                  <span className="font-medium group-hover:underline">{s.label}</span>
                  <span className="tabular-nums text-ink-700/70">
                    {s.average ?? "—"}% · {s.passRate}% pass · {s.sectionCount} div
                  </span>
                </div>
                <BarTrack value={s.average} color="#3d6b4f" />
              </Link>
            ))}
            {!data.classWise?.length && <EmptyNote>No class groups yet.</EmptyNote>}
          </div>
        </Panel>
        <Panel className="lg:col-span-7" title="Division-wise">
          <div className="space-y-4">
            {sections.map((s, i) => (
              <Link key={s.id} to={paths.classSection(s.id)} className="block group">
                <div className="flex items-baseline justify-between text-sm mb-1.5">
                  <span className="font-medium group-hover:underline">{s.label}</span>
                  <span className="tabular-nums text-ink-700/70">
                    {s.average ?? "—"}% · {s.passRate}% pass
                  </span>
                </div>
                <BarTrack value={s.average} color={i === 0 ? "#3d6b4f" : i === sections.length - 1 ? "#c45c26" : "#1b2437"} />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <Panel className="lg:col-span-7" title="Subject-wise" action={<Link className="text-xs underline text-ink-700/60" to="/analysis/subjects">All subjects</Link>}>
          <div className="space-y-3">
            {(data.subjectWise || []).map((s) => (
              <Link key={s.name} to={paths.subjectByName(s.name)} className="block group">
                <div className="flex items-baseline justify-between text-sm mb-1.5">
                  <span className="font-medium group-hover:underline">{s.name}</span>
                  <span className="tabular-nums text-ink-700/70">{s.average ?? "—"}% · {s.passRate ?? "—"}% pass</span>
                </div>
                <BarTrack value={s.average} />
              </Link>
            ))}
          </div>
        </Panel>
        <Panel className="lg:col-span-5" title="Grade mix">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={grades}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                {grades.map((g) => (
                  <Cell key={g.grade} fill={GRADE_COLORS[g.grade] || "#1b2437"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {(data.markBands?.length > 0 || data.outcomes) && (
        <div className="grid lg:grid-cols-12 gap-4 mb-4">
          <Panel
            className="lg:col-span-7"
            title="Mark-band distribution"
            action={
              <Link className="text-xs underline text-ink-700/60" to="/analysis/deep?tab=outcomes">
                Distinction & fail lists
              </Link>
            }
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.markBands || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
                <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Marks" fill="#1b2437" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel className="lg:col-span-5" title="Outcomes">
            <div className="space-y-2 text-sm">
              <div>Scored: {data.outcomes?.rates?.scored ?? 0}%</div>
              <div>Absent: {data.outcomes?.rates?.absent ?? 0}%</div>
              <div>Exempt: {data.outcomes?.rates?.exempt ?? 0}%</div>
              <div>Withheld: {data.outcomes?.rates?.withheld ?? 0}%</div>
            </div>
          </Panel>
        </div>
      )}

      <div className="mb-4">
        <YearComparison series={data.yearComparison} title="Same exam type versus previous years" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel title="School toppers" action={<Link className="text-xs underline text-ink-700/60" to="/analysis/students">All students</Link>}>
          {data.toppers.slice(0, 8).map((s) => (
            <RankRow
              key={s.studentId}
              rank={s.rank}
              name={s.name}
              meta={s.classLabel}
              value={`${s.average}%`}
              grade={s.grade}
              to={paths.student(s.studentId)}
            />
          ))}
        </Panel>
        <Panel title="Teacher leaderboard" action={<Link className="text-xs underline text-ink-700/60" to="/analysis/teachers">By teacher</Link>}>
          {teachers.slice(0, 8).map((row, i) => (
            <Link
              key={`${row.teacher}-${row.classLabel}-${row.subject}`}
              to={row.teacherId ? paths.teacher(row.teacherId) : "/analysis/teachers"}
              className="block py-2.5 border-t border-ink-900/10 first:border-0 hover:bg-white/40 -mx-1 px-1 rounded"
            >
              <div className="flex items-center justify-between text-sm mb-1.5">
                <div className="min-w-0">
                  <span className="text-ink-700/40 text-xs mr-2">{i + 1}</span>
                  <span className="font-medium">{row.teacher}</span>
                  <span className="text-ink-700/50 text-xs ml-2">{row.subject} · {row.classLabel}</span>
                </div>
                <span className="tabular-nums">{row.average}%</span>
              </div>
              <BarTrack value={row.average} color="#1b2437" />
            </Link>
          ))}
        </Panel>
      </div>
      {notify && (
        <NotifyTeachersDialog
          {...notify}
          onClose={() => setNotify(null)}
          onSent={(result) => {
            const n = result.sent ?? 0;
            if (n) toast.success(`Notified ${n} teacher${n === 1 ? "" : "s"}.`);
            else toast.info("No new notices sent.");
          }}
        />
      )}
    </div>
  );
}
