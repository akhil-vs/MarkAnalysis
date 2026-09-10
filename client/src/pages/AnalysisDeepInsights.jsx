import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { ExamSelect } from "../components/ExamSelect.jsx";
import Breadcrumb from "../components/Breadcrumb.jsx";
import { ChartTooltip, EmptyNote, Metric, Panel } from "../components/DashboardKit.jsx";
import { HelpHint } from "../components/HelpHint.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import { NAV_LABELS, NAV_TITLES, paths } from "../lib/nav.js";
import { DEEP_INSIGHT_HELP, DEEP_INSIGHT_PANEL_HELP as PANEL_HELP } from "../lib/pageHelp.js";

const TABS = [
  { id: "outcomes", label: "Outcomes & bands" },
  { id: "readiness", label: "Exam readiness" },
  { id: "division", label: "Division matrix" },
  { id: "improvement", label: "Improvement" },
  { id: "promotion", label: "Promotion" },
  { id: "teachers", label: "Teacher load" },
  { id: "weighted", label: "Annual composite" },
];

const STATUS_COLORS = {
  APPROVED: "#3d6b4f",
  AWAITING_APPROVAL: "#c45c26",
  PARTIAL: "#7a5c3a",
  MISSING: "#8a6a5a",
};

function TabBar({ tab, setTab }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <div
            key={t.id}
            className={`inline-flex items-center rounded-lg min-h-[2.75rem] sm:min-h-0 ${
              active ? "bg-ink-900 text-cream" : "border border-ink-900/15 bg-white/60 hover:bg-white"
            }`}
          >
            <button
              type="button"
              className="px-3.5 py-2.5 sm:py-2 text-sm font-medium"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
            <HelpHint
              help={DEEP_INSIGHT_HELP[t.id]}
              label={`About ${t.label}: what this insight shows and how it is useful`}
              size="sm"
              tone={active ? "onDark" : "default"}
            />
            <span className="w-1.5" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

function StudentMiniTable({ rows, empty }) {
  if (!rows?.length) return <EmptyNote>{empty || "No students in this list."}</EmptyNote>;
  return (
    <PaginatedTable items={rows} empty={empty}>
      {(page) => (
        <table className="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Avg</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {page.map((s) => (
              <tr key={s.studentId}>
                <td>
                  <Link className="underline" to={paths.student(s.studentId)}>
                    {s.name}
                  </Link>
                  <div className="text-[11px] text-ink-700/50">{s.rollNo}</div>
                </td>
                <td>{s.classLabel || "—"}</td>
                <td>
                  {s.average != null
                    ? `${s.average}%`
                    : s.avg != null
                      ? `${s.avg}%`
                      : s.current != null
                        ? `${s.current}%`
                        : s.composite != null
                          ? `${s.composite}%`
                          : "—"}
                  {s.grade ? ` ${s.grade}` : ""}
                </td>
                <td className={(s.delta ?? 0) > 0 ? "text-moss-600" : (s.delta ?? 0) < 0 ? "text-clay-600" : ""}>
                  {s.delta == null ? "—" : `${s.delta > 0 ? "+" : ""}${s.delta}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PaginatedTable>
  );
}

export default function AnalysisDeepInsights() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "outcomes";
  const [meta, setMeta] = useState(null);
  const [examId, setExamId] = useState("");
  const [className, setClassName] = useState("");
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function setTab(id) {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    api("/api/analytics/insights/meta")
      .then((m) => {
        setMeta(m);
        if (m.exams?.length) setExamId((id) => id || m.exams.at(-1).id);
        if (m.classNames?.length) setClassName((c) => c || m.classNames[0]);
        if (m.promotionYears?.fromYear) setFromYear((y) => y || m.promotionYears.fromYear);
        if (m.promotionYears?.toYear) setToYear((y) => y || m.promotionYears.toYear);
        const years = [...new Set((m.exams || []).map((e) => e.academicYear).filter(Boolean))].sort();
        if (years.length) setAcademicYear((y) => y || years.at(-1));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        let url = "";
        if (tab === "outcomes") url = `/api/analytics/insights/outcomes?examId=${examId}`;
        else if (tab === "readiness") url = `/api/analytics/insights/readiness?examId=${examId}`;
        else if (tab === "division") {
          if (!className) return;
          url = `/api/analytics/insights/division-matrix?examId=${examId}&className=${encodeURIComponent(className)}`;
        } else if (tab === "improvement") url = `/api/analytics/insights/improvement?examId=${examId}`;
        else if (tab === "promotion") {
          url = `/api/analytics/insights/promotion?fromYear=${encodeURIComponent(fromYear)}&toYear=${encodeURIComponent(toYear)}`;
        } else if (tab === "teachers") url = `/api/analytics/insights/teacher-load?examId=${examId}`;
        else if (tab === "weighted") {
          url = `/api/analytics/insights/weighted-annual?academicYear=${encodeURIComponent(academicYear)}`;
          if (className) url += `&className=${encodeURIComponent(className)}`;
        }
        if (!url) return;
        const res = await api(url);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [meta, tab, examId, className, fromYear, toYear, academicYear]);

  const years = useMemo(
    () => [...new Set((meta?.exams || []).map((e) => e.academicYear).filter(Boolean))].sort(),
    [meta]
  );

  if (error && !meta) return <p className="text-clay-600">{error}</p>;
  if (!meta) return <p className="text-ink-700/60">Loading deep insights…</p>;

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.analysisDeep}
        subtitle="Outcomes, readiness, division gaps, cohorts, teacher load, and weighted annuals"
        breadcrumb={
          <Breadcrumb
            items={[
              { label: NAV_LABELS.analysis, to: "/analysis" },
              { label: NAV_LABELS.analysisDeep },
            ]}
          />
        }
        actions={
          <>
            {tab !== "promotion" && tab !== "weighted" && (
              <ExamSelect exams={meta.exams} value={examId} onChange={setExamId} />
            )}
            {(tab === "division" || tab === "weighted") && (
              <select className="field-filter" value={className} onChange={(e) => setClassName(e.target.value)}>
                {tab === "weighted" && <option value="">All classes</option>}
                {(meta.classNames || []).map((c) => (
                  <option key={c} value={c}>
                    Class {c}
                  </option>
                ))}
              </select>
            )}
            {tab === "promotion" && (
              <>
                <select className="field-filter" value={fromYear} onChange={(e) => setFromYear(e.target.value)}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      From {y}
                    </option>
                  ))}
                </select>
                <select className="field-filter" value={toYear} onChange={(e) => setToYear(e.target.value)}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      To {y}
                    </option>
                  ))}
                </select>
              </>
            )}
            {tab === "weighted" && (
              <select className="field-filter" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            <Link className="btn-ghost" to="/school">
              Grade settings
            </Link>
          </>
        }
      />

      <TabBar tab={tab} setTab={setTab} />
      {error && <p className="text-clay-600 mb-3">{error}</p>}
      {loading && <p className="text-ink-700/60 mb-3">Loading…</p>}

      {!loading && data && tab === "outcomes" && <OutcomesTab data={data} />}
      {!loading && data && tab === "readiness" && <ReadinessTab data={data} />}
      {!loading && data && tab === "division" && <DivisionTab data={data} />}
      {!loading && data && tab === "improvement" && <ImprovementTab data={data} />}
      {!loading && data && tab === "promotion" && <PromotionTab data={data} />}
      {!loading && data && tab === "teachers" && <TeachersTab data={data} />}
      {!loading && data && tab === "weighted" && <WeightedTab data={data} />}
    </div>
  );
}

function OutcomesTab({ data }) {
  if (data.empty) return <EmptyNote>No exam data yet.</EmptyNote>;
  const rates = data.outcomes?.rates || {};
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Metric label="Scored" value={`${rates.scored ?? 0}%`} />
        <Metric label="Absent" value={`${rates.absent ?? 0}%`} />
        <Metric label="Distinction" value={data.lists?.counts?.distinction ?? 0} />
        <Metric label="Fail list" value={data.lists?.counts?.fail ?? 0} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Mark-band histogram" help={PANEL_HELP.markBands}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.markBands || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
              <XAxis dataKey="key" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Marks" fill="#1b2437" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Board-style counts" help={PANEL_HELP.boardCounts}>
          <div className="space-y-2 text-sm">
            <div>Pass (≥{data.grading?.passPercent}%): <strong>{data.lists?.counts?.pass ?? 0}</strong></div>
            <div>Distinction (≥{data.grading?.distinctionMin}%): <strong>{data.lists?.counts?.distinction ?? 0}</strong></div>
            <div>Fail: <strong>{data.lists?.counts?.fail ?? 0}</strong></div>
            <div>Students with averages: <strong>{data.lists?.counts?.students ?? 0}</strong></div>
          </div>
          {data.dualCeiling?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-ink-900/10 text-sm text-clay-700">
              Dual ceiling: {data.dualCeiling.length} subjects have different maxMarks vs consolidationMaxMarks.
            </div>
          )}
        </Panel>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Distinction list" help={PANEL_HELP.distinction}>
          <StudentMiniTable rows={data.lists?.distinction} empty="No distinction students." />
        </Panel>
        <Panel title="Fail list" help={PANEL_HELP.fail}>
          <StudentMiniTable rows={data.lists?.fail} empty="No students below pass." />
        </Panel>
      </div>
    </>
  );
}

function ReadinessTab({ data }) {
  if (data.empty) return <EmptyNote>No exam data yet.</EmptyNote>;
  const k = data.kpis || {};
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Metric label="Registers approved" value={`${k.approvedPct ?? 0}%`} />
        <Metric label="Awaiting approval" value={k.awaiting ?? 0} tone={k.awaiting ? "alert" : undefined} />
        <Metric label="Past deadline incomplete" value={k.breached ?? 0} tone={k.breached ? "alert" : undefined} />
        <Metric label="Late / edit pending" value={`${k.latePending ?? 0} / ${k.editPending ?? 0}`} />
      </div>
      {data.pastDeadline && (
        <p className="mb-3 text-sm text-clay-700">Marks entry deadline has passed{data.deadline ? ` (${new Date(data.deadline).toLocaleString()})` : ""}.</p>
      )}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Completeness heatmap" help={PANEL_HELP.heatmap}>
          <PaginatedTable items={data.heatmap || []} empty="No assignments.">
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Paper</th>
                    <th>Status</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((r, i) => (
                    <tr key={`${r.teacherId}-${r.subjectId}-${r.classSectionId}-${i}`}>
                      <td>{r.teacher}</td>
                      <td>
                        {r.classLabel} · {r.subject}
                      </td>
                      <td style={{ color: STATUS_COLORS[r.status] || undefined }}>{r.status}</td>
                      <td>
                        {r.approved}/{r.expected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </Panel>
        <Panel title="Late / edit requests by teacher" help={PANEL_HELP.lateByTeacher}>
          <PaginatedTable items={data.lateByTeacher || []} empty="No access requests for this exam.">
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Pending</th>
                    <th>Late</th>
                    <th>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((r) => (
                    <tr key={r.teacherId}>
                      <td>
                        <Link className="underline" to={paths.teacher(r.teacherId)}>
                          {r.teacher}
                        </Link>
                      </td>
                      <td>{r.pending}</td>
                      <td>{r.lateEntry}</td>
                      <td>{r.edit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </Panel>
      </div>
    </>
  );
}

function DivisionTab({ data }) {
  if (data.empty) return <EmptyNote>No data for this class.</EmptyNote>;
  const sections = data.gapMatrix?.sections || [];
  return (
    <>
      <div className="mb-4">
        <Panel title={`Subject × section averages · Class ${data.className}`} help={PANEL_HELP.subjectSectionAverages}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  {sections.map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {(data.gapMatrix?.matrix || []).map((row) => (
                  <tr key={row.subject}>
                    <td>{row.subject}</td>
                    {sections.map((s) => (
                      <td key={s}>{row.sections[s]?.average ?? "—"}</td>
                    ))}
                    <td>{row.gap ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Largest section gaps" help={PANEL_HELP.largestGaps}>
          <ul className="space-y-2 text-sm">
            {(data.gapMatrix?.largestGaps || []).map((g) => (
              <li key={g.subject}>
                <strong>{g.subject}</strong>: {g.gap} pts ({g.leader?.section} {g.leader?.average}% vs {g.trailer?.section}{" "}
                {g.trailer?.average}%)
              </li>
            ))}
            {!data.gapMatrix?.largestGaps?.length && <EmptyNote>Need two or more sections with marks.</EmptyNote>}
          </ul>
        </Panel>
        <Panel title="Pass / fail by subject" help={PANEL_HELP.passFail}>
          <PaginatedTable items={data.passFail || []} empty="No pass/fail data.">
            {(page) => (
              <table className="table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Pass</th>
                    <th>Fail</th>
                    <th>AB</th>
                    <th>Pass %</th>
                  </tr>
                </thead>
                <tbody>
                  {page.map((r) => (
                    <tr key={r.subject}>
                      <td>{r.subject}</td>
                      <td>{r.pass}</td>
                      <td>{r.fail}</td>
                      <td>{r.absent}</td>
                      <td>{r.passRate ?? "—"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        </Panel>
      </div>
      <Panel title="Subject completeness" help={PANEL_HELP.subjectCompleteness}>
        <PaginatedTable items={data.completeness || []} empty="No registers.">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Teacher</th>
                  <th>Status</th>
                  <th>Approved</th>
                </tr>
              </thead>
              <tbody>
                {page.map((r, i) => (
                  <tr key={`${r.classSectionId}-${r.subjectId}-${i}`}>
                    <td>
                      {r.classLabel} · {r.subject}
                    </td>
                    <td>{r.teacher}</td>
                    <td style={{ color: STATUS_COLORS[r.status] || undefined }}>{r.status}</td>
                    <td>
                      {r.approved}/{r.expected}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </Panel>
    </>
  );
}

function ImprovementTab({ data }) {
  if (data.empty) return <EmptyNote>{data.message || "Nothing to compare yet."}</EmptyNote>;
  const s = data.summary || {};
  return (
    <>
      <p className="text-sm text-ink-700/70 mb-3">
        Compared with {data.previous?.label} ({data.previous?.academicYear || "—"})
      </p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Metric label="Compared" value={s.compared ?? 0} />
        <Metric label="Improving" value={s.improving ?? 0} />
        <Metric label="Declining" value={s.declining ?? 0} />
        <Metric label="Avg Δ" value={s.avgDelta != null ? `${s.avgDelta > 0 ? "+" : ""}${s.avgDelta}` : "—"} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Panel title="Improving cohort" help={PANEL_HELP.improving}>
          <StudentMiniTable rows={data.improving} />
        </Panel>
        <Panel title="Declining cohort" help={PANEL_HELP.declining}>
          <StudentMiniTable rows={data.declining} />
        </Panel>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Recovered (fail → pass)" help={PANEL_HELP.recovered}>
          <StudentMiniTable rows={data.recovered} />
        </Panel>
        <Panel title="Slipped (pass → fail)" help={PANEL_HELP.slipped}>
          <StudentMiniTable rows={data.slipped} />
        </Panel>
      </div>
    </>
  );
}

function PromotionTab({ data }) {
  if (data.empty) return <EmptyNote>{data.message || "Need promotion lineage across years."}</EmptyNote>;
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        <Metric label="Promoted students" value={data.count ?? 0} />
        <Metric label="Average Δ" value={data.averageDelta != null ? `${data.averageDelta > 0 ? "+" : ""}${data.averageDelta}` : "—"} />
        <Metric label="Years" value={`${data.fromYear} → ${data.toYear}`} />
      </div>
      <Panel title="Carry-forward averages" help={PANEL_HELP.carryForward}>
        <PaginatedTable items={data.students || []} empty="No promoted students with both-year marks.">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>From → To</th>
                  <th>Prev</th>
                  <th>Current</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {page.map((s) => (
                  <tr key={s.studentId}>
                    <td>
                      <Link className="underline" to={paths.student(s.studentId)}>
                        {s.name}
                      </Link>
                    </td>
                    <td>
                      {s.fromClass} → {s.toClass}
                    </td>
                    <td>{s.previousAvg ?? "—"}%</td>
                    <td>{s.currentAvg ?? "—"}%</td>
                    <td className={(s.delta ?? 0) > 0 ? "text-moss-600" : (s.delta ?? 0) < 0 ? "text-clay-600" : ""}>
                      {s.delta == null ? "—" : `${s.delta > 0 ? "+" : ""}${s.delta}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </Panel>
    </>
  );
}

function TeachersTab({ data }) {
  if (data.empty) return <EmptyNote>No exam data yet.</EmptyNote>;
  return (
    <>
      <Panel title="Load vs outcome" className="mb-4" help={PANEL_HELP.loadVsOutcome}>
        <PaginatedTable items={data.teachers || []} empty="No teacher assignments.">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Students</th>
                  <th>Papers</th>
                  <th>Avg</th>
                  <th>Pass</th>
                  <th>Absence %</th>
                  <th>Days to first</th>
                  <th>Requests</th>
                </tr>
              </thead>
              <tbody>
                {page.map((t) => (
                  <tr key={t.teacherId}>
                    <td>
                      <Link className="underline" to={paths.teacher(t.teacherId)}>
                        {t.teacher}
                      </Link>
                    </td>
                    <td>{t.studentsTaught}</td>
                    <td>{t.papers}</td>
                    <td>{t.average ?? "—"}%</td>
                    <td>{t.passRate ?? "—"}%</td>
                    <td>{t.absenceRate ?? "—"}%</td>
                    <td>{t.avgDaysToFirst ?? "—"}</td>
                    <td>{t.accessRequests?.total ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </Panel>
      <Panel title="Register velocity" help={PANEL_HELP.registerVelocity}>
        <PaginatedTable items={data.velocity || []} empty="No entry timing yet.">
          {(page) => (
            <table className="table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Paper</th>
                  <th>Days to first</th>
                  <th>Days after deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {page.map((v, i) => (
                  <tr key={`${v.teacherId}-${v.subject}-${i}`}>
                    <td>{v.teacher}</td>
                    <td>
                      {v.classLabel} · {v.subject}
                    </td>
                    <td>{v.daysToFirst ?? "—"}</td>
                    <td className={v.daysAfterDeadline > 0 ? "text-clay-600" : ""}>{v.daysAfterDeadline ?? "—"}</td>
                    <td>{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PaginatedTable>
      </Panel>
    </>
  );
}

function WeightedTab({ data }) {
  if (data.empty) return <EmptyNote>{data.message || "No annual data."}</EmptyNote>;
  const w = data.weights || {};
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Metric label="Students scored" value={data.summary?.students ?? 0} />
        <Metric label="Composite avg" value={data.summary?.average != null ? `${data.summary.average}%` : "—"} />
        <Metric label="Distinction" value={data.summary?.distinction ?? 0} />
        <Metric label="Below pass" value={data.summary?.fail ?? 0} />
      </div>
      <p className="text-sm text-ink-700/70 mb-3">
        Weights: Unit {w.UNIT_TEST ?? 0} · Mid {w.MID_TERM ?? 0} · Final {w.FINAL ?? 0}
        {" · "}
        <Link className="underline" to="/school">
          Configure
        </Link>
      </p>
      <Panel title={`Weighted annual · ${data.academicYear}`} help={PANEL_HELP.weightedAnnual}>
        <StudentMiniTable
          rows={(data.students || []).map((s) => ({
            ...s,
            average: s.composite,
            delta: null,
          }))}
        />
      </Panel>
    </>
  );
}
