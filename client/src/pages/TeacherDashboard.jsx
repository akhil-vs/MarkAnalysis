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
import { LoadError } from "../components/LoadError.jsx";
import { ExamSelect } from "../components/ExamSelect.jsx";
import { BusyLabel, LoadingState } from "../components/Spinner.jsx";
import { YearComparison } from "../components/AnalysisPanels.jsx";
import {
  BarTrack,
  DashboardHero,
  EmptyExamDashboard,
  EmptyNote,
  Metric,
  Panel,
  RankRow,
  greeting,
} from "../components/DashboardKit.jsx";
import { useToast } from "../components/Toast.jsx";
import { useNotificationsOptional } from "../components/NotificationBell.jsx";
import { helpForPath } from "../lib/pageHelp.js";
import { dashboardApiPath, peekDashboardPrefetch, revalidateDashboard } from "../lib/dashboardPrefetch.js";
import { paths } from "../lib/nav.js";

const COLORS = ["#1b2437", "#c45c26", "#3d6b4f", "#7a5c3a"];

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TeacherLeaveRequest({ userId }) {
  const toast = useToast();
  const [startDate, setStartDate] = useState(todayYmd());
  const [endDate, setEndDate] = useState(todayYmd());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState(null);

  async function loadMine() {
    const from = todayYmd();
    const end = new Date();
    end.setDate(end.getDate() + 60);
    const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    try {
      const rows = await api(
        `/api/timetable/leaves?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=ALL`
      );
      setMine(
        (rows || []).filter((l) => l.status === "PENDING" || l.status === "ACTIVE").slice(0, 6)
      );
    } catch {
      setMine([]);
    }
  }

  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [userId]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/timetable/leaves", {
        method: "POST",
        body: {
          teacherId: userId,
          startDate,
          endDate,
          reason: reason || undefined,
          suggestCovers: false,
        },
      });
      toast.success("Leave request submitted for approval");
      setReason("");
      await loadMine();
    } catch (err) {
      toast.error(err.message || "Could not submit leave");
    } finally {
      setSaving(false);
    }
  }

  async function cancelPending(leaveId) {
    try {
      await api(`/api/timetable/leaves/${leaveId}`, { method: "DELETE" });
      toast.success("Request cancelled");
      await loadMine();
    } catch (err) {
      toast.error(err.message || "Could not cancel");
    }
  }

  return (
    <Panel className="mb-5" title="My leave">
      <p className="text-sm text-ink-700/70 mb-3">
        Request leave for approval. Once approved, it appears on school timetables and notifies the
        principal, vice principal, supervisors, and coordinators.
      </p>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3 max-w-xl mb-4">
        <label className="block">
          <span className="label">Start</span>
          <input
            type="date"
            className="field"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">End</span>
          <input
            type="date"
            className="field"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Reason (optional)</span>
          <input
            className="field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Sick leave, personal, training…"
          />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            <BusyLabel busy={saving} idle="Request leave" busyText="Submitting…" />
          </button>
        </div>
      </form>
      {mine === null && <p className="text-sm text-ink-700/55">Loading your leave…</p>}
      {mine && !mine.length && <EmptyNote>No pending or upcoming leave.</EmptyNote>}
      {mine && mine.length > 0 && (
        <ul className="space-y-2 text-sm">
          {mine.map((leave) => (
            <li
              key={leave.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-900/10 px-3 py-2"
            >
              <div>
                <span className="font-medium">
                  {leave.startDate}
                  {leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ""}
                </span>
                <span className="ml-2 text-ink-700/55">
                  {leave.status === "PENDING" ? "Awaiting approval" : "Approved"}
                  {leave.reason ? ` · ${leave.reason}` : ""}
                </span>
              </div>
              {leave.status === "PENDING" && (
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => cancelPending(leave.id)}
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function TeacherDashboard() {
  const { user, assignments, classTeacherOf, optimistic } = useAuth();
  const notifications = useNotificationsOptional();
  const homePath = dashboardApiPath("TEACHER");
  const [data, setData] = useState(() => peekDashboardPrefetch(homePath, { userId: user?.id }));
  const [examId, setExamId] = useState(() => data?.exam?.id || "");
  const [notices, setNotices] = useState([]);
  const [error, setError] = useState("");

  async function load(id) {
    setError("");
    const path = `/api/analytics/teacher${id ? `?examId=${id}` : ""}`;
    try {
      const res = await api(path);
      setData(res);
      if (res.exam) setExamId(res.exam.id);
    } catch (err) {
      if (!data) setError(err.message || "Could not load your classes");
    }
  }

  async function loadNotices() {
    try {
      if (notifications) {
        await notifications.loadList();
        return;
      }
      const res = await api("/api/notifications?limit=8");
      setNotices(Array.isArray(res.items) ? res.items : []);
    } catch {
      setNotices([]);
    }
  }

  useEffect(() => {
    if (notifications?.listLoaded) {
      setNotices((notifications.items || []).slice(0, 8));
    }
  }, [notifications?.items, notifications?.listLoaded]);

  useEffect(() => {
    if (optimistic) return undefined;
    const fresh = peekDashboardPrefetch(homePath, { userId: user?.id });
    if (fresh) {
      setData(fresh);
      if (fresh.exam) setExamId(fresh.exam.id);
    }
    if (fresh || data) {
      revalidateDashboard(homePath, {
        userId: user?.id,
        email: user?.email,
        schoolId: user?.schoolId,
        onData: (res) => {
          setData(res);
          if (res?.exam) setExamId(res.exam.id);
        },
      });
    } else {
      load("");
    }
    const noticeTimer = window.setTimeout(loadNotices, 0);
    return () => window.clearTimeout(noticeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- home paint once per mount / optimistic flip
  }, [optimistic]);

  async function openNotice(notice) {
    if (!notice.readAt) {
      try {
        await api(`/api/notifications/${notice.id}/read`, { method: "PATCH" });
        setNotices((prev) =>
          prev.map((n) => (n.id === notice.id ? { ...n, readAt: new Date().toISOString() } : n))
        );
        notifications?.setItems?.((prev) =>
          prev.map((n) => (n.id === notice.id ? { ...n, readAt: new Date().toISOString() } : n))
        );
        notifications?.refreshUnread?.();
      } catch {
        // continue to link
      }
    }
  }

  if (error) return <LoadError message={error} />;
  if (!data) return <LoadingState label="Loading your classes…" />;

  if (data.empty) {
    return (
      <div>
        <EmptyExamDashboard
          role="TEACHER"
          name={user.name}
          setup={data.setup}
          reason={data.reason}
          help={helpForPath("/", user.role)}
        />
        <TeacherLeaveRequest userId={user.id} />
      </div>
    );
  }

  const registers = data.registers || [];
  const unreadNotices = notices.filter((n) => !n.readAt);
  const notableTypes = new Set([
    "LATE_ENTRY_APPROVED",
    "LATE_ENTRY_REJECTED",
    "EDIT_APPROVED",
    "EDIT_REJECTED",
    "DEADLINE_REMINDER",
    "INCOMPLETE_MARKLIST",
    "STAFF_NOTICE",
  ]);
  const dashboardNotices = (unreadNotices.length ? unreadNotices : notices.filter((n) => notableTypes.has(n.type))).slice(0, 5);
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

      {dashboardNotices.length > 0 && (
        <Panel
          className="mb-5"
          title="Notices"
          action={
            unreadNotices.length ? (
              <span className="text-xs text-clay-600">{unreadNotices.length} unread</span>
            ) : null
          }
        >
          <div className="space-y-2">
            {dashboardNotices.map((notice) => {
              const approved = notice.type === "LATE_ENTRY_APPROVED" || notice.type === "EDIT_APPROVED";
              const rejected = notice.type === "LATE_ENTRY_REJECTED" || notice.type === "EDIT_REJECTED";
              const chip =
                notice.type === "DEADLINE_REMINDER"
                  ? { label: "Deadline", className: "mark-chip mark-chip-pending" }
                  : notice.type === "INCOMPLETE_MARKLIST"
                    ? { label: "Marklist", className: "mark-chip mark-chip-dirty" }
                    : notice.type === "STAFF_NOTICE"
                      ? { label: "Notice", className: "mark-chip mark-chip-submitted" }
                      : approved
                        ? { label: "Approved", className: "mark-chip mark-chip-approved" }
                        : rejected
                          ? { label: "Rejected", className: "mark-chip mark-chip-dirty" }
                          : null;
              return (
                <Link
                  key={notice.id}
                  to={notice.link || "/marks"}
                  onClick={() => openNotice(notice)}
                  className={`block rounded-xl border px-4 py-3 transition hover:border-clay-500/40 ${
                    notice.readAt ? "border-ink-900/10 bg-white/40" : "border-clay-500/25 bg-[#fbf4ec]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-ink-900">{notice.title}</div>
                      <div className="mt-1 text-sm text-ink-700/70">{notice.body}</div>
                    </div>
                    <div className="text-right">
                      {chip && <span className={chip.className}>{chip.label}</span>}
                      <div className="mt-1 text-[10px] text-ink-700/45">
                        {new Date(notice.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>
      )}

      <TeacherLeaveRequest userId={user.id} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <Metric label="Your average" value={data.kpis?.average != null ? `${data.kpis.average}%` : "—"} />
        <Metric label="Students" value={data.kpis?.students ?? "—"} />
        <Metric label="Sections" value={data.kpis?.sections ?? "—"} />
        <Metric
          label="Registers to finish"
          value={data.kpis?.pendingRegisters ?? 0}
          tone={data.kpis?.pendingRegisters ? "alert" : undefined}
          to="/marks"
          hint={{
            text: data.kpis?.pendingRegisters ? "Open mark register" : "All assigned rows entered",
            tone: data.kpis?.pendingRegisters ? "down" : "up",
          }}
        />
      </div>

      {classTeacherOf?.length > 0 && (
        <Panel
          className="mb-5"
          title="Class teacher"
          action={
            <Link className="text-xs underline text-ink-700/60" to={`/class-inbox${examId ? `?examId=${examId}` : ""}`}>
              Open inbox
            </Link>
          }
        >
          <p className="text-sm text-ink-700/70 mb-3">
            Track pending subject papers for your sections, then open the consolidated list once every register is approved.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-accent" to={`/class-inbox${examId ? `?examId=${examId}` : ""}`}>
              Class inbox
            </Link>
            {classTeacherOf.map((c) => (
              <Link
                key={c.id}
                className="btn-ghost"
                to={`/consolidated?examId=${examId}&classSectionId=${c.id}`}
              >
                {c.label || `${c.className}-${c.section}`} · CML
              </Link>
            ))}
          </div>
        </Panel>
      )}

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
                    <span>{r.statusLabel || (r.provisional ? "Submitted — awaiting approval" : "Marks entered")}</span>
                    <span>{r.uploaded} / {r.expected}</span>
                  </div>
                  <BarTrack
                    value={r.expected ? (r.uploaded / r.expected) * 100 : 0}
                    color={r.missing ? "#c45c26" : r.provisional || r.status === "AWAITING_APPROVAL" ? "#b45309" : "#3d6b4f"}
                  />
                </div>
                <div className="mt-3 flex gap-3 text-xs">
                  <Link className="underline" to={paths.classSection(r.classSectionId)}>Class view</Link>
                  <Link className="underline" to={paths.marks({ classSectionId: r.classSectionId, subjectId: r.subjectId })}>
                    {r.missing ? "Finish register" : r.provisional || r.status === "AWAITING_APPROVAL" ? "Submitted" : "Mark register"}
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
              to={paths.student(s.studentId)}
            />
          ))
        ) : (
          <EmptyNote>No one in your sections is currently flagged as at risk or declining.</EmptyNote>
        )}
      </Panel>
    </div>
  );
}
