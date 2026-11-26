import { useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "../auth.jsx";
import { YearComparison } from "../components/AnalysisPanels.jsx";
import Breadcrumb from "../components/Breadcrumb.jsx";
import CurricularPerformanceHub from "../components/CurricularPerformanceHub.jsx";
import {
  ChartTooltip,
  EmptyExamDashboard,
  EmptyNote,
  GRADE_COLORS,
  GradePill,
  Metric,
  Panel,
  greeting,
} from "../components/DashboardKit.jsx";
import { ExamSelect } from "../components/ExamSelect.jsx";
import { PageHelpHint } from "../components/HelpHint.jsx";
import { LoadError } from "../components/LoadError.jsx";
import NotifyTeachersDialog from "../components/NotifyTeachersDialog.jsx";
import { PaginatedTable } from "../components/PaginatedTable.jsx";
import PendingAccessRequests from "../components/PendingAccessRequests.jsx";
import PendingSubmittedApprovals from "../components/PendingSubmittedApprovals.jsx";
import { SchoolSectionSelect } from "../components/SchoolSectionSelect.jsx";
import { InlineLoading, LoadingState } from "../components/Spinner.jsx";
import { TableToolbar } from "../components/TableToolbar.jsx";
import { useToast } from "../components/Toast.jsx";
import { apiErrorMessage } from "../lib/apiErrorMessage.js";
import {
  dashboardApiPath,
  isDashboardPrefetchFresh,
  peekDashboardPrefetch,
  revalidateDashboard,
} from "../lib/dashboardPrefetch.js";
import { yearDelta } from "../lib/exams.js";
import { NAV_LABELS, paths } from "../lib/nav.js";
import { helpForPath } from "../lib/pageHelp.js";
import { SCHOOL_SECTIONS, normalizeSchoolSection, schoolSectionLabel } from "../lib/schoolSections.js";
import { useWorkspaceOptional } from "../workspace.jsx";

/** Strip trailing " · 2025-26" so the same exam type aligns across years. */
function examTypeLabel(point) {
  const raw = point?.examName || point?.term || "Exam";
  return String(raw).replace(/\s*·\s*\d{4}\s*[-–]\s*\d{2,4}\s*$/, "").trim() || raw;
}

/** Pivot term averages into a dual-year series for the longitudinal chart. */
function buildLongitudinalSeries(termTrend = [], currentYear) {
  if (!termTrend.length) return { rows: [], currentYear: null, baselineYear: null };

  const years = [...new Set(termTrend.map((p) => p.academicYear).filter(Boolean))];
  const activeYear = currentYear || years.at(-1) || null;
  const baselineYear =
    years.filter((y) => y !== activeYear).sort().at(-1) || (years.length > 1 ? years[0] : null);

  const byLabel = new Map();
  for (const point of termTrend) {
    const label = examTypeLabel(point);
    if (!byLabel.has(label)) {
      byLabel.set(label, { label, date: point.date, current: null, baseline: null });
    }
    const row = byLabel.get(label);
    if (point.academicYear === activeYear && point.date) {
      if (!row.date || new Date(point.date) < new Date(row.date)) row.date = point.date;
    } else if (!row.date && point.date) {
      row.date = point.date;
    }
    if (point.academicYear === activeYear) row.current = point.average;
    else if (baselineYear && point.academicYear === baselineYear) row.baseline = point.average;
    else if (!point.academicYear && row.current == null) row.current = point.average;
  }

  const rows = [...byLabel.values()].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  return { rows, currentYear: activeYear, baselineYear };
}

function echoKey(examId, section) {
  return `${examId || ""}|${normalizeSchoolSection(section)}`;
}

function levelChoices(options) {
  const list = options?.length ? options : SCHOOL_SECTIONS;
  return list.map((opt) => {
    if (!opt.classRange) return { ...opt, shortLabel: "All levels" };
    const name = opt.shortLabel || opt.label;
    return { ...opt, shortLabel: `${name} ${opt.classRange.min}–${opt.classRange.max}` };
  });
}

function relevantPapers(teacher) {
  return (teacher.assignments || [])
    .filter((paper) => {
      const missing = paper.missing ?? 0;
      const waiting =
        paper.status === "AWAITING_APPROVAL" ||
        ((paper.submitted ?? 0) > 0 && (paper.approved ?? 0) < (paper.expected ?? 0));
      return missing > 0 || waiting;
    })
    .sort(
      (a, b) =>
        String(a.classLabel || "").localeCompare(String(b.classLabel || "")) ||
        String(a.subject || "").localeCompare(String(b.subject || ""))
    );
}

function paperNote(paper) {
  const missing = paper.missing ?? 0;
  if (missing > 0) {
    const expected = paper.expected ?? 0;
    const progress = paper.statusLabel ? `${paper.statusLabel}. ` : "";
    const count =
      expected > 0 ? `${missing} of ${expected} marks still empty` : `${missing} marks still empty`;
    return `${progress}${count}`;
  }
  return paper.statusLabel || "Submitted, waiting for approval";
}

function paperKey(paper, index) {
  return `${paper.classSectionId || paper.classLabel || "class"}|${paper.subjectId || paper.subject || index}`;
}

function registerStatus(teacher) {
  const missing = teacher.missingAssignments ?? 0;
  const waiting = teacher.awaitingApprovalAssignments ?? 0;
  if (missing > 0 && waiting > 0) {
    return {
      label: missing === 1 ? "1 register not submitted" : `${missing} registers not submitted`,
      detail: `${waiting === 1 ? "1 other register is" : `${waiting} other registers are`} submitted and waiting for your approval`,
      tone: missing >= 3 ? "high" : "open",
    };
  }
  if (missing > 0) {
    return {
      label: missing === 1 ? "1 register not submitted" : `${missing} registers not submitted`,
      detail:
        missing >= 3
          ? "High: three or more registers still have missing marks"
          : "Marks are still missing on the papers listed",
      tone: missing >= 3 ? "high" : "open",
    };
  }
  return {
    label: waiting === 1 ? "1 register waiting for approval" : `${waiting} registers waiting for approval`,
    detail: "The teacher has submitted these marks. They stay unpublished until you approve them.",
    tone: "review",
  };
}

function PaperList({ papers }) {
  const [expanded, setExpanded] = useState(false);
  if (!papers.length) {
    return <span className="text-sm text-ink-700/55">Papers are not listed on this summary.</span>;
  }
  const shown = expanded ? papers : papers.slice(0, 3);
  return (
    <div className="min-w-0">
      <ul className="space-y-1">
        {shown.map((paper, index) => (
          <li key={paperKey(paper, index)} className="text-sm leading-snug break-words">
            <span className="font-medium text-ink-900">{paper.classLabel}</span>
            <span className="text-ink-800"> {paper.subject}</span>
            <span className="text-ink-700/60"> · {paperNote(paper)}</span>
          </li>
        ))}
      </ul>
      {papers.length > 3 && (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-ink-700 underline decoration-ink-900/20 underline-offset-2"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show fewer papers" : `Show all ${papers.length} papers`}
        </button>
      )}
    </div>
  );
}

function StudentAverageTable({ rows, showRank = false }) {
  return (
    <div className="scroll-x">
      <table className="table table-cards w-full">
        <thead>
          <tr>
            {showRank && (
              <th scope="col" className="whitespace-nowrap">
                Rank
              </th>
            )}
            <th scope="col">Student</th>
            <th scope="col" className="whitespace-nowrap">
              Roll no.
            </th>
            <th scope="col">Class</th>
            <th scope="col">Average</th>
            <th scope="col">Grade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student, index) => (
            <tr key={student.studentId}>
              {showRank && (
                <td data-label="Rank" className="align-top tabular-nums">
                  {student.rank ?? index + 1}
                </td>
              )}
              <td data-label="Student" className="align-top">
                <Link className="font-medium hover:underline" to={paths.student(student.studentId)}>
                  {student.name}
                </Link>
              </td>
              <td data-label="Roll no." className="align-top tabular-nums">
                {student.rollNo || "—"}
              </td>
              <td data-label="Class" className="align-top">
                {student.classLabel}
              </td>
              <td data-label="Average" className="align-top tabular-nums">
                {student.average != null ? `${student.average}%` : "—"}
              </td>
              <td data-label="Grade" className="align-top">
                <GradePill grade={student.grade} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeacherPaperTable({ rows }) {
  return (
    <div className="scroll-x">
      <table className="table table-cards w-full">
        <thead>
          <tr>
            <th scope="col">Teacher</th>
            <th scope="col">Subject</th>
            <th scope="col">Class</th>
            <th scope="col">Average</th>
            <th scope="col" className="whitespace-nowrap">
              Pass rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.teacherId || row.teacher}|${row.classLabel}|${row.subject}`}>
              <td data-label="Teacher" className="align-top">
                <Link
                  className="font-medium hover:underline"
                  to={row.teacherId ? paths.teacher(row.teacherId) : "/analysis/teachers"}
                >
                  {row.teacher}
                </Link>
              </td>
              <td data-label="Subject" className="align-top">
                {row.subject}
              </td>
              <td data-label="Class" className="align-top">
                {row.classLabel}
              </td>
              <td data-label="Average" className="align-top tabular-nums">
                {row.average != null ? `${row.average}%` : "—"}
              </td>
              <td data-label="Pass rate" className="align-top tabular-nums">
                {row.passRate != null ? `${row.passRate}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const OUTCOME_ROWS = [
  ["SCORED", "scored", "Scored", "A numeric mark. Included in averages and the pass rate."],
  ["ABSENT", "absent", "Absent", "Marked absent. Left out of the average."],
  ["EXEMPT", "exempt", "Exempt", "Marked exempt. Left out of the average."],
  ["WITHHELD", "withheld", "Withheld", "Marked withheld. Left out of the average."],
];

export default function PrincipalDashboard() {
  const { user, optimistic } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const workspace = useWorkspaceOptional();
  const homePath = dashboardApiPath("PRINCIPAL");
  const prefetched = peekDashboardPrefetch(homePath, { userId: user?.id });
  const [data, setData] = useState(() => prefetched);
  const [examId, setExamId] = useState(() => workspace?.examId || prefetched?.exam?.id || "");
  const [schoolSection, setSchoolSection] = useState(() =>
    normalizeSchoolSection(workspace?.schoolSection || prefetched?.schoolSection || "ALL")
  );
  const [error, setError] = useState("");
  const [notify, setNotify] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [queueQuery, setQueueQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState("all");
  const loadSeq = useRef(0);
  const pendingPublish = useRef("");
  const appliedWorkspace = useRef("");

  const openTeachers = useMemo(() => {
    const list = (data?.pendingUploads?.teachers || []).filter((teacher) => teacher.pending || teacher.awaitingApproval);
    return [...list].sort(
      (a, b) =>
        (b.missingAssignments ?? 0) - (a.missingAssignments ?? 0) ||
        String(a.name || "").localeCompare(String(b.name || ""))
    );
  }, [data]);

  const queueRows = useMemo(() => {
    const query = queueQuery.trim().toLowerCase();
    return openTeachers.filter((teacher) => {
      if (queueFilter === "missing" && !teacher.pending) return false;
      if (queueFilter === "approval" && (teacher.pending || !teacher.awaitingApproval)) return false;
      if (!query) return true;
      const blob = [
        teacher.name,
        teacher.email,
        ...(teacher.assignments || []).flatMap((paper) => [paper.classLabel, paper.subject]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(query);
    });
  }, [openTeachers, queueFilter, queueQuery]);

  function publishWorkspace(id, section) {
    const nextSection = normalizeSchoolSection(section);
    const key = echoKey(id, nextSection);
    pendingPublish.current = key;
    appliedWorkspace.current = key;
    if (!workspace) return;
    if (id && id !== workspace.examId) workspace.setExamId(id).catch(() => {});
    if (nextSection !== normalizeSchoolSection(workspace.schoolSection)) {
      workspace.setSchoolSection(nextSection).catch(() => {});
    }
  }

  async function loadDetail(summary, section = schoolSection, seq = loadSeq.current) {
    if (!summary?.exam?.id || summary.empty) return;
    setDetailLoading(true);
    try {
      const detailQ = new URLSearchParams({
        examId: summary.exam.id,
        include: "detail",
      });
      if (section && section !== "ALL") detailQ.set("schoolSection", section);
      const detail = await api(`/api/analytics/school?${detailQ}`);
      if (seq !== loadSeq.current) return;
      setData((prev) => ({ ...(prev || {}), ...detail }));
      if (detail.schoolSection) setSchoolSection(normalizeSchoolSection(detail.schoolSection));
    } catch {
      // summary already painted
    } finally {
      if (seq === loadSeq.current) setDetailLoading(false);
    }
  }

  async function load(id, section = schoolSection) {
    const seq = ++loadSeq.current;
    setError("");
    const base = new URLSearchParams();
    if (id) base.set("examId", id);
    base.set("include", "summary");
    const nextSection = normalizeSchoolSection(section);
    if (nextSection !== "ALL") base.set("schoolSection", nextSection);
    const path = `/api/analytics/school?${base}`;
    try {
      const payload = await api(path);
      if (seq !== loadSeq.current) return;
      setData(payload);
      setSchoolSection(normalizeSchoolSection(payload.schoolSection || nextSection));
      if (payload.empty) {
        setDetailLoading(false);
        return;
      }
      if (payload.exam) setExamId(payload.exam.id);
      void loadDetail(payload, nextSection, seq);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (!data) setError(apiErrorMessage(e, "Could not load school view"));
    }
  }

  function onSchoolSectionChange(next) {
    const section = normalizeSchoolSection(next);
    setSchoolSection(section);
    publishWorkspace(examId, section);
    load(examId, section);
  }

  useEffect(() => {
    if (optimistic) return;
    const fresh = peekDashboardPrefetch(homePath, { userId: user?.id });
    if (fresh) {
      setData(fresh);
      if (fresh.exam) setExamId(fresh.exam.id);
      if (fresh.schoolSection) setSchoolSection(normalizeSchoolSection(fresh.schoolSection));
    }
    // A saved working exam arrives through the workspace effect. Don't paint a
    // different exam from the prefetch and then lock onto it.
    if (workspace?.loading || workspace?.examId) return;
    const summary = fresh || data;
    const section = normalizeSchoolSection(fresh?.schoolSection || schoolSection || "ALL");
    if (summary && !summary.empty) {
      if (summary.exam?.id) setExamId(summary.exam.id);
      setSchoolSection(section);
      void loadDetail(summary, section);
      if (section === "ALL" && !isDashboardPrefetchFresh(homePath)) {
        revalidateDashboard(homePath, {
          userId: user?.id,
          email: user?.email,
          schoolId: user?.schoolId,
          onData: (next) => {
            setData((prev) => {
              if (normalizeSchoolSection(prev?.schoolSection) !== "ALL") return prev;
              return { ...(prev || {}), ...next };
            });
            if (next?.exam) setExamId(next.exam.id);
          },
        });
      }
      return;
    }
    load("", section);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint once per mount / optimistic flip
  }, [optimistic]);

  useEffect(() => {
    if (optimistic || !workspace || workspace.loading) return;
    const nextExam = workspace.examId || "";
    const nextSection = normalizeSchoolSection(workspace.schoolSection || "ALL");
    const key = echoKey(nextExam, nextSection);
    if (pendingPublish.current) {
      if (pendingPublish.current !== key) return;
      pendingPublish.current = "";
      appliedWorkspace.current = key;
      return;
    }
    if (appliedWorkspace.current === key) return;
    appliedWorkspace.current = key;
    if (!data) {
      load(nextExam, nextSection);
      return;
    }
    const dataExam = data.exam?.id || "";
    const sameView =
      (nextExam || "") === (examId || "") &&
      nextSection === normalizeSchoolSection(schoolSection) &&
      (!dataExam || !nextExam || dataExam === nextExam);
    if (sameView) {
      if (dataExam && !data.empty && !Array.isArray(data.toppers)) void loadDetail(data, nextSection);
      return;
    }
    load(nextExam, nextSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow the shared working exam
  }, [workspace?.examId, workspace?.schoolSection, workspace?.loading, optimistic]);

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
        text: `${sign}${yoy.diff} points vs ${yoy.prev.academicYear}`,
        tone: yoy.diff > 0 ? "up" : yoy.diff < 0 ? "down" : "flat",
      };
    }
    return deltaFromPoints(current?.average, prev?.average);
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

  const pending = openTeachers.filter((teacher) => teacher.pending);
  const awaitingApproval = openTeachers.filter((teacher) => teacher.awaitingApproval && !teacher.pending);
  const sections = [...(data.sectionAverages || [])].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const teachers = [...(data.teacherPerf || [])].sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  const toppers = data.toppers || [];
  const atRisk = data.atRisk || [];
  const examPass = data.examPass || [];
  const passRate = data.kpis.passRate;
  const scoredStudents = data.outcomeLists?.counts?.students;
  const registersBreached = Boolean(data.readiness?.kpis?.breached);
  const registersPastDeadline = data.readiness?.pastDeadline;
  const pageHelp = helpForPath(location.pathname, user.role);
  const onSchoolOverview = location.pathname.startsWith("/analysis/school");
  const sectionLabel = schoolSectionLabel(schoolSection, data.schoolSections);
  const scopePhrase = schoolSection === "ALL" ? "Whole school" : sectionLabel;
  const averageLabel = schoolSection === "ALL" ? "School average" : `${sectionLabel} average`;
  const passPercent = data.boardSummary?.passPercent ?? data.grading?.passPercent ?? 50;
  const distinctionMin = data.boardSummary?.distinctionMin ?? data.grading?.distinctionMin ?? 90;
  const examBits = [data.exam.name, data.exam.term, data.exam.academicYear].filter(Boolean);
  const studentCount = data.kpis.students ?? 0;
  const averageSentence =
    data.kpis.schoolAverage != null
      ? `${averageLabel} is ${data.kpis.schoolAverage}%.`
      : "No approved marks to average yet.";
  const summarySentence = `${examBits.join(" · ")}. ${scopePhrase}, ${studentCount} student${
    studentCount === 1 ? "" : "s"
  } on roll. ${averageSentence}`;
  const passValue = scoredStudents === 0 ? "No marks" : passRate != null ? `${passRate}%` : "—";
  const actionBtn = "w-full sm:w-auto justify-center";

  return (
    <div>
      {onSchoolOverview && (
        <Breadcrumb
          items={[
            { label: NAV_LABELS.analysis, to: "/analysis" },
            { label: NAV_LABELS.analysisSchool },
          ]}
        />
      )}

      <header className="mb-5 sm:mb-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-700/50 mb-1">
          {onSchoolOverview ? NAV_LABELS.analysisSchool : "Principal desk"}
        </p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl sm:text-4xl leading-tight flex items-start gap-2 flex-wrap">
              <span className="break-words">{greeting(user.name)}</span>
              <PageHelpHint help={pageHelp} />
            </h1>
            <p className="mt-2 text-sm text-ink-700/70 max-w-2xl">{summarySentence}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full lg:w-auto lg:justify-end">
            <Link className={`btn-ghost ${actionBtn}`} to="/analysis/deep">
              Deep insights
            </Link>
            <Link className={`btn-ghost ${actionBtn}`} to={`/consolidated?examId=${encodeURIComponent(examId)}`}>
              Consolidated lists
            </Link>
            <button
              type="button"
              className={`btn-moss ${actionBtn}`}
              onClick={() =>
                download(`/api/exports/table.xlsx?examId=${examId}`, "marks.xlsx").catch((err) =>
                  toast.error(err.message || "Download failed")
                )
              }
            >
              Export Excel
            </button>
          </div>
        </div>
      </header>

      <section aria-label="Working exam and school level" className="mb-5 card p-3 sm:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 lg:w-72">
            <label className="label" htmlFor="principal-working-exam">
              Working exam
            </label>
            <ExamSelect
              id="principal-working-exam"
              className="field-filter-grow"
              exams={data.exams}
              value={examId}
              onChange={(id) => {
                setExamId(id);
                publishWorkspace(id, schoolSection);
                load(id, schoolSection);
              }}
            />
            <p className="mt-2 text-xs leading-relaxed text-ink-700/60">
              The numbers and the register table follow this exam. Other pages keep the same choice.
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="label">School level</div>
            <SchoolSectionSelect
              value={schoolSection}
              options={levelChoices(data.schoolSections)}
              onChange={onSchoolSectionChange}
              aria-label="School level"
              className="max-w-full"
            />
            <p className="mt-2 text-xs leading-relaxed text-ink-700/60">
              Primary is classes 1–5, Secondary is 6–10, and Senior secondary is 11–12. This is not one
              division, such as 6-A.
            </p>
          </div>
        </div>
      </section>

      <div className="kpi-grid mb-5">
        <Metric
          label={averageLabel}
          value={data.kpis.schoolAverage != null ? `${data.kpis.schoolAverage}%` : "No marks"}
          hint={
            data.kpis.schoolAverage != null
              ? trendDelta
              : { text: "Approved marks will set this average", tone: "flat" }
          }
        />
        <Metric
          label="Pass rate"
          value={passValue}
          hint={{
            text:
              scoredStudents === 0
                ? `Pass mark is ${passPercent}%. No scored students yet.`
                : `Share of scored students at or above ${passPercent}%`,
            tone: "flat",
          }}
        />
        <Metric
          label="Students below pass mark"
          value={data.boardSummary?.fail ?? 0}
          hint={{
            text: `${data.boardSummary?.distinction ?? 0} students at distinction (${distinctionMin}% or above)`,
            tone: (data.boardSummary?.fail ?? 0) > 0 ? "down" : "flat",
          }}
        />
        <Metric
          label="Registers approved"
          value={data.readiness?.kpis?.approvedPct != null ? `${data.readiness.kpis.approvedPct}%` : "—"}
          to="/analysis/deep?tab=readiness"
          tone={registersBreached ? "alert" : undefined}
          badge={registersBreached ? { text: "Past deadline", tone: "alert" } : undefined}
          hint={{
            text: registersPastDeadline
              ? `${data.readiness.kpis?.breached ?? 0} registers are past the deadline and still incomplete`
              : `${data.readiness?.kpis?.awaiting ?? 0} registers are submitted and waiting for approval`,
            tone: registersBreached ? "down" : "flat",
          }}
        />
      </div>

      <section aria-labelledby="decisions-heading" className="mb-4">
        <h2 id="decisions-heading" className="font-serif text-xl sm:text-2xl">
          Decisions waiting on you
        </h2>
        <p className="mt-1 mb-3 max-w-3xl text-sm text-ink-700/65">
          Submitted marks and access requests cover every exam, not only {data.exam.name}.
        </p>
        <div className="space-y-3">
          <PendingSubmittedApprovals emptyMode="line" />
          <PendingAccessRequests emptyMode="line" />
        </div>
      </section>

      <Panel className="mb-8" title="Open registers">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {pending.length > 0 && (
            <button
              type="button"
              className="btn-ghost text-xs w-full sm:w-auto justify-center !py-2"
              onClick={() =>
                setNotify({
                  kind: "INCOMPLETE",
                  examId,
                  audience: "PENDING",
                  exams: data.exams,
                })
              }
            >
              Remind {pending.length} with missing marks
            </button>
          )}
          <Link className="btn-ghost text-xs w-full sm:w-auto justify-center !py-2" to={paths.pendingUploads({ examId })}>
            Open in exam queue
          </Link>
        </div>
        <p className="mb-3 max-w-3xl text-sm text-ink-700/65">
          Each row is one teacher for {data.exam.name}. A register is one class and one subject, such as 6-A
          Mathematics. “Not submitted” means marks are still empty. “Waiting for approval” means the teacher has
          submitted and you have not approved yet.
        </p>
        {openTeachers.length === 0 ? (
          <EmptyNote>Every assigned register for this exam is approved.</EmptyNote>
        ) : (
          <>
            <TableToolbar
              q={queueQuery}
              setQ={setQueueQuery}
              placeholder="Search teacher or class"
              matched={queueRows.length}
              total={openTeachers.length}
              className="mb-3"
            >
              <label className="inline-flex items-center gap-2 text-xs text-ink-700/70 min-w-0">
                <span className="shrink-0">Show</span>
                <select
                  className="field-filter max-w-full"
                  aria-label="Which open registers to show"
                  value={queueFilter}
                  onChange={(event) => setQueueFilter(event.target.value)}
                >
                  <option value="all">All open ({openTeachers.length})</option>
                  <option value="missing">Not submitted ({pending.length})</option>
                  <option value="approval">Waiting for approval ({awaitingApproval.length})</option>
                </select>
              </label>
            </TableToolbar>
            <PaginatedTable
              items={queueRows}
              pageSize={8}
              resetKey={`${examId}|${schoolSection}|${queueFilter}|${queueQuery}`}
              itemLabel="teachers"
              empty="No teachers match this search or filter."
            >
              {(rows) => (
                <table className="table table-cards w-full">
                  <caption className="sr-only">
                    Teachers with registers that are not submitted or are waiting for approval
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Teacher</th>
                      <th scope="col">Status</th>
                      <th scope="col">Papers</th>
                      <th scope="col">
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((teacher) => {
                      const status = registerStatus(teacher);
                      const papers = relevantPapers(teacher);
                      return (
                        <tr key={teacher.teacherId}>
                          <td data-label="Teacher" className="align-top min-w-0 sm:min-w-[8rem]">
                            <div className="min-w-0 text-right sm:text-left">
                              <div className="font-medium break-words">{teacher.name}</div>
                              {teacher.email && (
                                <div className="text-xs text-ink-700/55 break-words">{teacher.email}</div>
                              )}
                            </div>
                          </td>
                          <td data-label="Status" className="align-top sm:max-w-[16rem]">
                            <div className="min-w-0 text-right sm:text-left">
                              <div
                                className={`text-sm font-medium ${
                                  status.tone === "high" ? "text-clay-600" : "text-ink-900"
                                }`}
                              >
                                {status.label}
                              </div>
                              <div className="mt-0.5 text-xs leading-relaxed text-ink-700/60">{status.detail}</div>
                            </div>
                          </td>
                          <td data-label="Papers" className="align-top">
                            <PaperList papers={papers} />
                          </td>
                          <td data-label="" className="align-top sm:w-40">
                            {teacher.pending ? (
                              <button
                                type="button"
                                className="btn-ghost text-xs w-full sm:w-auto justify-center"
                                aria-label={`Send a reminder to ${teacher.name} about registers that are not submitted`}
                                onClick={() =>
                                  setNotify({
                                    kind: "INCOMPLETE",
                                    examId,
                                    audience: "SELECTED",
                                    teacherIds: [teacher.teacherId],
                                    teacherName: teacher.name,
                                    exams: data.exams,
                                  })
                                }
                              >
                                Send reminder
                              </button>
                            ) : (
                              <Link
                                className="btn-ghost text-xs w-full sm:w-auto justify-center"
                                to={paths.approvals({ examId })}
                              >
                                Review submission
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </PaginatedTable>
          </>
        )}
      </Panel>

      <section aria-labelledby="results-heading">
        <h2 id="results-heading" className="font-serif text-xl sm:text-2xl">
          Results
        </h2>
        <p className="mt-1 mb-4 max-w-3xl text-sm text-ink-700/65">
          Averages use approved marks for {scopePhrase.toLowerCase()}. Absent, exempt, and withheld entries are
          counted in the outcome table and are not part of the average.
        </p>
        {detailLoading && <InlineLoading label="Loading class, subject, and student rankings…" className="mb-4" />}

        <div className="mb-4">
          <Panel title="How the average is moving">
            <p className="mb-3 text-xs leading-relaxed text-ink-700/60">
              {longitudinal.baselineYear
                ? `The solid line is ${longitudinal.currentYear || "this year"}. The dashed line is ${longitudinal.baselineYear}. Exams are matched by name, so Term 1 lines up with Term 1.`
                : "Each point is the school average for an exam. A previous year is added once that exam has approved marks."}
            </p>
            {longitudinal.rows.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={longitudinal.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis domain={[40, 100]} tick={{ fontSize: 12 }} width={36} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {longitudinal.baselineYear && (
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      name={longitudinal.baselineYear}
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
                    name={longitudinal.currentYear || "This year"}
                    stroke="#3d6b4f"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#3d6b4f" }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyNote>
                {detailLoading ? "Loading the average over time…" : "Not enough exam history to chart movement yet."}
              </EmptyNote>
            )}
            {examPass.length > 0 && (
              <div className="mt-4 scroll-x">
                <p className="mb-2 text-xs text-ink-700/60">
                  Pass rate on recent exams. This is the share of scored students at or above {passPercent}%.
                </p>
                <table className="table table-cards w-full">
                  <thead>
                    <tr>
                      <th scope="col">Exam</th>
                      <th scope="col">Pass rate</th>
                      <th scope="col">Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examPass.slice(-6).map((exam) => (
                      <tr key={exam.examId}>
                        <td data-label="Exam">{exam.label || exam.name}</td>
                        <td data-label="Pass rate" className="tabular-nums">
                          {exam.passRate != null ? `${exam.passRate}%` : "—"}
                        </td>
                        <td data-label="Average" className="tabular-nums">
                          {exam.average != null ? `${exam.average}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <CurricularPerformanceHub
          classWise={data.classWise || []}
          sections={sections}
          subjectWise={data.subjectWise || []}
          teachers={teachers}
          schoolAverage={data.kpis?.schoolAverage}
          detailLoading={detailLoading}
        />

        <div className="grid lg:grid-cols-12 gap-4 mb-4">
          <Panel className="lg:col-span-7" title="Grade mix">
            <p className="mb-3 text-xs text-ink-700/60">Number of students in each grade for this exam.</p>
            {grades.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={grades}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
                  <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                    {grades.map((grade) => (
                      <Cell key={grade.grade} fill={GRADE_COLORS[grade.grade] || "#1b2437"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyNote>{detailLoading ? "Loading grade mix…" : "No grade distribution yet."}</EmptyNote>
            )}
          </Panel>
          <Panel
            className="lg:col-span-5"
            title="Mark outcomes"
            action={
              <Link className="text-xs underline text-ink-700/60" to="/analysis/deep?tab=outcomes">
                Distinction and fail lists
              </Link>
            }
          >
            {data.outcomes ? (
              <div className="scroll-x">
                <table className="table table-cards w-full">
                  <thead>
                    <tr>
                      <th scope="col">Outcome</th>
                      <th scope="col">Count</th>
                      <th scope="col">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OUTCOME_ROWS.map(([key, rateKey, label, meaning]) => (
                      <tr key={key}>
                        <td data-label="Outcome">
                          <div className="min-w-0 text-right sm:text-left">
                            <div className="font-medium">{label}</div>
                            <div className="text-xs text-ink-700/55">{meaning}</div>
                          </div>
                        </td>
                        <td data-label="Count" className="tabular-nums">
                          {data.outcomes[key] ?? 0}
                        </td>
                        <td data-label="Share" className="tabular-nums">
                          {data.outcomes.rates?.[rateKey] ?? 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyNote>{detailLoading ? "Loading outcomes…" : "No outcome data yet."}</EmptyNote>
            )}
          </Panel>
        </div>

        <div className="mb-4">
          <Panel title="Mark bands">
            <p className="mb-3 text-xs text-ink-700/60">
              Count of scored marks in each percent band. 90–100 is the top band.
            </p>
            {data.markBands?.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.markBands}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd0" />
                  <XAxis dataKey="key" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Marks" fill="#1b2437" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyNote>{detailLoading ? "Loading mark bands…" : "No scored marks to band yet."}</EmptyNote>
            )}
          </Panel>
        </div>

        <div className="mb-4">
          <YearComparison series={data.yearComparison} title="Same exam type versus previous years" />
        </div>

        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <Panel
            title="Students below the pass mark"
            action={
              <Link className="text-xs underline text-ink-700/60" to="/analysis/students">
                All students
              </Link>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-ink-700/60">
              Lowest averages under {passPercent}%. This list shows up to 15 students.
            </p>
            {!Array.isArray(data.atRisk) ? (
              <EmptyNote>
                {detailLoading ? "Loading students below the pass mark…" : "Student averages are not available yet."}
              </EmptyNote>
            ) : atRisk.length === 0 ? (
              <EmptyNote>No student average is below the pass mark of {passPercent}%.</EmptyNote>
            ) : (
              <StudentAverageTable rows={atRisk} />
            )}
          </Panel>
          <Panel
            title="Highest student averages"
            action={
              <Link className="text-xs underline text-ink-700/60" to="/analysis/students">
                All students
              </Link>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-ink-700/60">
              Rank 1 has the highest average of scored marks for this exam.
            </p>
            {!Array.isArray(data.toppers) ? (
              <EmptyNote>{detailLoading ? "Loading highest averages…" : "Student averages are not available yet."}</EmptyNote>
            ) : toppers.length === 0 ? (
              <EmptyNote>No student averages for this exam yet.</EmptyNote>
            ) : (
              <StudentAverageTable rows={toppers.slice(0, 8)} showRank />
            )}
          </Panel>
        </div>

        <Panel
          title="Teacher paper averages"
          action={
            <Link className="text-xs underline text-ink-700/60" to="/analysis/teachers">
              All teachers
            </Link>
          }
        >
          <p className="mb-3 text-xs leading-relaxed text-ink-700/60">
            Each row is one class and subject. The average is scored marks on that paper. It is not a ranking of
            teaching quality.
          </p>
          {teachers.length ? (
            <TeacherPaperTable rows={teachers.slice(0, 12)} />
          ) : (
            <EmptyNote>
              {detailLoading ? "Loading teacher averages…" : "No teacher averages for this exam yet."}
            </EmptyNote>
          )}
        </Panel>
      </section>

      {notify && (
        <NotifyTeachersDialog
          {...notify}
          onClose={() => setNotify(null)}
          onSent={(result) => {
            const sent = result.sent ?? 0;
            if (sent) toast.success(`Reminder sent to ${sent} teacher${sent === 1 ? "" : "s"}.`);
            else toast.info("No new reminders sent.");
          }}
        />
      )}
    </div>
  );
}

function deltaFromPoints(current, previous) {
  if (current == null || previous == null) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return { text: "Same as the previous exam", tone: "flat" };
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${diff} points vs the previous exam`,
    tone: diff > 0 ? "up" : "down",
  };
}
