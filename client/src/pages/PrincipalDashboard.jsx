import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, download } from "../api.js";
import { LoadError } from "../components/LoadError.jsx";
import { InlineLoading, LoadingState } from "../components/Spinner.jsx";
import { useAuth } from "../auth.jsx";
import Breadcrumb from "../components/Breadcrumb.jsx";
import { ExamSelect } from "../components/ExamSelect.jsx";
import { YearComparison } from "../components/AnalysisPanels.jsx";
import {
  BarTrack,
  ChartTooltip,
  DashboardHero,
  EmptyExamDashboard,
  EmptyNote,
  GRADE_COLORS,
  Metric,
  Panel,
  RankRow,
  deltaLabel,
  greeting,
} from "../components/DashboardKit.jsx";
import { helpForPath } from "../lib/pageHelp.js";
import PendingAccessRequests from "../components/PendingAccessRequests.jsx";
import PendingSubmittedApprovals from "../components/PendingSubmittedApprovals.jsx";
import NotifyTeachersDialog from "../components/NotifyTeachersDialog.jsx";
import { useToast } from "../components/Toast.jsx";
import { yearDelta } from "../lib/exams.js";
import { dashboardApiPath, peekDashboardPrefetch, revalidateDashboard } from "../lib/dashboardPrefetch.js";
import { NAV_LABELS, paths } from "../lib/nav.js";

/** Pivot term averages into a dual-year series for the longitudinal chart. */
function buildLongitudinalSeries(termTrend = [], currentYear) {
  if (!termTrend.length) return { rows: [], currentYear: null, baselineYear: null };

  const years = [...new Set(termTrend.map((p) => p.academicYear).filter(Boolean))];
  const activeYear = currentYear || years.at(-1) || null;
  const baselineYear =
    years.filter((y) => y !== activeYear).sort().at(-1) || (years.length > 1 ? years[0] : null);

  const byLabel = new Map();
  for (const point of termTrend) {
    const label = point.examName || point.term || "Exam";
    if (!byLabel.has(label)) {
      byLabel.set(label, { label, date: point.date, current: null, baseline: null });
    }
    const row = byLabel.get(label);
    if (point.date && (!row.date || new Date(point.date) < new Date(row.date))) {
      row.date = point.date;
    }
    if (point.academicYear === activeYear) row.current = point.average;
    else if (baselineYear && point.academicYear === baselineYear) row.baseline = point.average;
    else if (!point.academicYear && row.current == null) row.current = point.average;
  }

  const rows = [...byLabel.values()].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  return { rows, currentYear: activeYear, baselineYear };
}

function pendingLeftTone(count) {
  if (count >= 3) return "text-clay-600";
  if (count >= 1) return "text-[#b06a1a]";
  return "text-ink-700/55";
}

function OutcomeRow({ label, value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-1.5">
        <span className="text-ink-700/70">{label}</span>
        <span className="tabular-nums font-medium">{pct}%</span>
      </div>
      <BarTrack value={pct} color={pct >= 90 ? "#3d6b4f" : pct > 0 ? "#1b2437" : "#d4cdc1"} />
    </div>
  );
}

export default function PrincipalDashboard() {
  const { user, optimistic } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const homePath = dashboardApiPath("PRINCIPAL");
  const [data, setData] = useState(() => peekDashboardPrefetch(homePath, { userId: user?.id }));
  const [examId, setExamId] = useState(() => data?.exam?.id || "");
  const [error, setError] = useState("");
  const [notify, setNotify] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadDetail(summary) {
    if (!summary?.exam?.id || summary.empty) return;
    setDetailLoading(true);
    try {
      const detailQ = new URLSearchParams({
        examId: summary.exam.id,
        include: "detail",
      });
      const detail = await api(`/api/analytics/school?${detailQ}`);
      setData((prev) => ({ ...(prev || {}), ...detail }));
    } catch {
      // summary already painted
    } finally {
      setDetailLoading(false);
    }
  }

  async function load(id) {
    setError("");
    const base = new URLSearchParams();
    if (id) base.set("examId", id);
    // Cold path: one round-trip for summary+detail instead of summary-then-detail waterfall.
    base.set("include", "summary,detail");
    const path = `/api/analytics/school?${base}`;
    try {
      const payload = await api(path);
      setData(payload);
      setDetailLoading(false);
      if (payload.empty) return;
      if (payload.exam) setExamId(payload.exam.id);
    } catch (e) {
      if (!data) setError(e.message || "Could not load school view");
    }
  }

  useEffect(() => {
    if (optimistic) return;
    const fresh = peekDashboardPrefetch(homePath, { userId: user?.id });
    if (fresh) {
      setData(fresh);
      if (fresh.exam) setExamId(fresh.exam.id);
    }
    const summary = fresh || data;
    if (summary) {
      loadDetail(summary);
      revalidateDashboard(homePath, {
        userId: user?.id,
        email: user?.email,
        schoolId: user?.schoolId,
        onData: (next) => {
          setData((prev) => ({ ...(prev || {}), ...next }));
          if (next?.exam) setExamId(next.exam.id);
        },
      });
    } else {
      load("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- home paint once per mount / optimistic flip
  }, [optimistic]);

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
        text: `${sign}${yoy.diff} vs ${yoy.prev.academicYear} baseline`,
        tone: yoy.diff > 0 ? "up" : yoy.diff < 0 ? "down" : "flat",
      };
    }
    return deltaLabel(current?.average, prev?.average);
  }, [data, examId]);

  const longitudinal = useMemo(
    () => buildLongitudinalSeries(data?.termTrend || [], data?.exam?.academicYear),
    [data]
  );

  if (error) return <LoadError message={error} />;
  if (!data) return <LoadingState label="Loading school view…" />;
  if (data.empty) {
    return (
      <EmptyExamDashboard
        role={user.role}
        name={user.name}
        setup={data.setup}
        reason={data.reason}
        help={helpForPath(location.pathname, user.role)}
      />
    );
  }

  const pending = (data.pendingUploads?.teachers || []).filter((t) => t.pending);
  const awaitingApproval = (data.pendingUploads?.teachers || []).filter((t) => t.awaitingApproval && !t.pending);
  // Detail fields arrive in a second request after summary — default to [] so summary paint is safe.
  const sections = [...(data.sectionAverages || [])].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const teachers = [...(data.teacherPerf || [])].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const toppers = data.toppers || [];
  const atRisk = data.atRisk || [];
  const examPass = data.examPass || [];
  const passRate = data.kpis.passRate;
  const registersBreached = Boolean(data.readiness?.kpis?.breached);
  const registersPastDeadline = data.readiness?.pastDeadline;
  const outcomeTotal = data.outcomes?.total ?? 0;
  const pageHelp = helpForPath(location.pathname, user.role);

  const deskLabel = location.pathname.startsWith("/analysis/school")
    ? NAV_LABELS.analysisSchool
    : user.role === "PRINCIPAL"
      ? "Principal desk"
      : "Exam coordination";

  return (
    <div>
      <Breadcrumb
        items={[
          { label: deskLabel.toUpperCase(), to: location.pathname.startsWith("/analysis/school") ? "/" : undefined },
          { label: "ACADEMIC ANALYSIS" },
        ]}
      />

      <DashboardHero
        title={greeting(user.name)}
        subtitle={`${data.exam.name}${data.exam.term ? ` · ${data.exam.term}` : ""}: School average ${data.kpis.schoolAverage ?? "—"}% across ${data.kpis.students} students.`}
        help={pageHelp}
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
              className="btn-moss"
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
        <Metric
          label="School average"
          value={data.kpis.schoolAverage != null ? `${data.kpis.schoolAverage}%` : "—"}
          hint={trendDelta}
        />
        <Metric
          label="Pass rate"
          value={passRate != null ? `${passRate}%` : "—"}
          badge={passRate != null && passRate >= 95 ? { text: "Optimal", tone: "up" } : undefined}
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
          tone={registersBreached ? "alert" : undefined}
          badge={registersBreached ? { text: "Action Req.", tone: "alert" } : undefined}
          hint={{
            text: registersPastDeadline
              ? `${data.readiness.kpis?.breached ?? 0} past deadline incomplete`
              : `${data.readiness?.kpis?.awaiting ?? 0} awaiting approval`,
            tone: registersBreached ? "down" : "flat",
          }}
        />
      </div>

      {detailLoading && <InlineLoading label="Loading charts and rankings…" className="mb-4" />}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <PendingSubmittedApprovals />
        <PendingAccessRequests />
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
                  Notify all
                </button>
              )}
              <Link className="text-xs underline text-ink-700/60" to={paths.pendingUploads()}>
                Upload status
              </Link>
            </div>
          }
        >
          {pending.length || awaitingApproval.length ? (
            <div className="space-y-1">
              {awaitingApproval.map((t) => (
                <div
                  key={`await-${t.teacherId}`}
                  className="flex items-start justify-between gap-3 rounded-lg px-1 py-2.5 -mx-1 hover:bg-white/50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-[11px] text-ink-700/50 truncate">
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
                  <div className="text-xs text-clay-600 whitespace-nowrap shrink-0">Awaiting approval</div>
                </div>
              ))}
              {pending.map((t) => (
                <div
                  key={t.teacherId}
                  className="flex items-start justify-between gap-3 rounded-lg px-1 py-2.5 -mx-1 hover:bg-white/50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-[11px] text-ink-700/50 truncate">
                      {t.assignments.filter((a) => a.missing > 0).map((a) => `${a.classLabel} ${a.subject}`).join(" · ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-medium whitespace-nowrap ${pendingLeftTone(t.missingAssignments)}`}>
                      {t.missingAssignments} left
                    </span>
                    <button
                      type="button"
                      className="btn-ghost text-xs !min-h-0 !py-1 !px-2.5"
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
          {atRisk.length > 0 && (
            <div className="mt-5 pt-4 border-t border-ink-900/10">
              <div className="text-[11px] uppercase tracking-wider text-ink-700/50 mb-2">
                Students below {data.boardSummary?.passPercent ?? 50}%
              </div>
              {atRisk.slice(0, 4).map((s, i) => (
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
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-7" title="How the school is moving">
          {longitudinal.rows.length ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={longitudinal.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis domain={[40, 100]} tick={{ fontSize: 12 }} width={36} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {longitudinal.baselineYear && (
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      name={`${longitudinal.baselineYear} Baseline`}
                      stroke="#9aa3b2"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={{ r: 3, fill: "#9aa3b2" }}
                      connectNulls
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="current"
                    name={longitudinal.currentYear ? `${longitudinal.currentYear} Trend` : "Trend"}
                    stroke="#3d6b4f"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#3d6b4f" }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-700/60">
                {examPass.slice(-4).map((e) => (
                  <span key={e.examId}>
                    {e.label || e.name}: <span className="text-ink-900 font-medium">{e.passRate}% pass</span>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyNote>{detailLoading ? "Loading trend…" : "Not enough exam history to chart movement yet."}</EmptyNote>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <Panel
          className="lg:col-span-5"
          title="Class-wise"
          action={
            <Link className="text-xs underline text-ink-700/60" to="/analysis/classes">
              All classes
            </Link>
          }
        >
          <div className="space-y-4">
            {(data.classWise || []).map((s) => (
              <Link key={s.className} to={paths.classGroup(s.className)} className="block group">
                <div className="flex items-baseline justify-between text-sm mb-1.5 gap-2">
                  <span className="font-medium group-hover:underline">{s.label}</span>
                  <span className="tabular-nums text-ink-700/70 shrink-0">
                    {s.average ?? "—"}% · {s.passRate}% pass
                  </span>
                </div>
                <BarTrack value={s.average} color="#3d6b4f" />
              </Link>
            ))}
            {!data.classWise?.length && (
              <EmptyNote>{detailLoading ? "Loading classes…" : "No class groups yet."}</EmptyNote>
            )}
          </div>
        </Panel>

        <Panel className="lg:col-span-7" title="Division-wise">
          {sections.length ? (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {sections.map((s) => (
                <Link
                  key={s.id}
                  to={paths.classSection(s.id)}
                  className="flex items-baseline justify-between gap-3 rounded-lg px-1 py-2 -mx-1 text-sm hover:bg-white/50 group"
                >
                  <span className="font-medium group-hover:underline truncate">{s.label}</span>
                  <span className="tabular-nums text-ink-700/70 shrink-0">
                    {s.average ?? "—"}% · {s.passRate}%
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyNote>{detailLoading ? "Loading divisions…" : "No divisions yet."}</EmptyNote>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-12 gap-4 mb-4">
        <Panel
          className="lg:col-span-7"
          title="Subject-wise"
          action={
            <Link className="text-xs underline text-ink-700/60" to="/analysis/subjects">
              All subjects
            </Link>
          }
        >
          <div className="space-y-3">
            {(data.subjectWise || []).map((s) => (
              <Link key={s.name} to={paths.subjectByName(s.name)} className="block group">
                <div className="flex items-baseline justify-between text-sm mb-1.5 gap-2">
                  <span className="font-medium group-hover:underline truncate">{s.name}</span>
                  <span className="tabular-nums text-ink-700/70 shrink-0">
                    {s.average ?? "—"}% · {s.passRate ?? "—"}% pass
                  </span>
                </div>
                <BarTrack value={s.average} />
              </Link>
            ))}
            {!data.subjectWise?.length && (
              <EmptyNote>{detailLoading ? "Loading subjects…" : "No subject averages yet."}</EmptyNote>
            )}
          </div>
        </Panel>
        <Panel className="lg:col-span-5" title="Grade mix">
          {grades.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={grades}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
                <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                  {grades.map((g) => (
                    <Cell key={g.grade} fill={GRADE_COLORS[g.grade] || "#1b2437"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyNote>{detailLoading ? "Loading grade mix…" : "No grade distribution yet."}</EmptyNote>
          )}
        </Panel>
      </div>

      {(data.markBands?.length > 0 || data.outcomes || detailLoading) && (
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
            {data.markBands?.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.markBands}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
                  <XAxis dataKey="key" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Marks" fill="#1b2437" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyNote>{detailLoading ? "Loading mark bands…" : "No scored marks to band yet."}</EmptyNote>
            )}
          </Panel>
          <Panel className="lg:col-span-5" title="Outcomes">
            {data.outcomes ? (
              <div className="space-y-3">
                <OutcomeRow label="Scored" value={data.outcomes.rates?.scored} />
                <OutcomeRow label="Absent" value={data.outcomes.rates?.absent} />
                <OutcomeRow label="Exempt" value={data.outcomes.rates?.exempt} />
                <OutcomeRow label="Withheld" value={data.outcomes.rates?.withheld} />
                {outcomeTotal > 0 && (
                  <div className="pt-3 mt-1 border-t border-ink-900/10 text-xs text-ink-700/55">
                    <span className="font-medium text-ink-900 tabular-nums">
                      {data.outcomes.SCORED ?? 0}/{outcomeTotal}
                    </span>{" "}
                    registered marks
                  </div>
                )}
              </div>
            ) : (
              <EmptyNote>{detailLoading ? "Loading outcomes…" : "No outcome data yet."}</EmptyNote>
            )}
          </Panel>
        </div>
      )}

      <div className="mb-4">
        <YearComparison series={data.yearComparison} title="Same exam type versus previous years" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel
          title="School toppers"
          action={
            <Link className="text-xs underline text-ink-700/60" to="/analysis/students">
              All students
            </Link>
          }
        >
          {toppers.slice(0, 8).map((s) => (
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
          {!toppers.length && (
            <EmptyNote>{detailLoading ? "Loading rankings…" : "No toppers for this exam yet."}</EmptyNote>
          )}
        </Panel>
        <Panel
          title="Teacher leaderboard"
          action={
            <Link className="text-xs underline text-ink-700/60" to="/analysis/teachers">
              By teacher
            </Link>
          }
        >
          {teachers.slice(0, 8).map((row, i) => (
            <Link
              key={`${row.teacher}-${row.classLabel}-${row.subject}`}
              to={row.teacherId ? paths.teacher(row.teacherId) : "/analysis/teachers"}
              className="block py-2.5 border-t border-ink-900/10 first:border-0 hover:bg-white/40 -mx-1 px-1 rounded"
            >
              <div className="flex items-center justify-between text-sm mb-1.5 gap-2">
                <div className="min-w-0">
                  <span className="text-ink-700/40 text-xs mr-2">{i + 1}</span>
                  <span className="font-medium">{row.teacher}</span>
                  <span className="text-ink-700/50 text-xs ml-2">
                    {row.subject} · {row.classLabel}
                  </span>
                </div>
                <span className="tabular-nums shrink-0">{row.average}%</span>
              </div>
              <BarTrack value={row.average} color="#1b2437" />
            </Link>
          ))}
          {!teachers.length && (
            <EmptyNote>{detailLoading ? "Loading rankings…" : "No teacher averages for this exam yet."}</EmptyNote>
          )}
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
