import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import NotificationBell from "./NotificationBell.jsx";

const ROLE_LABEL = {
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam Coordinator",
  TEACHER: "Teacher",
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(null);
  const [lateEntryCount, setLateEntryCount] = useState(null);
  const isLeadership = user.role !== "TEACHER";
  const analysisOpen =
    location.pathname.startsWith("/analysis") ||
    location.pathname.startsWith("/students") ||
    location.pathname.startsWith("/classes");

  useEffect(() => {
    if (!isLeadership) return;
    api("/api/analytics/pending-uploads")
      .then((d) => setPendingCount((d.pendingTeacherCount ?? 0) + (d.awaitingApprovalTeacherCount ?? 0)))
      .catch(() => setPendingCount(null));
    api("/api/mark-access?status=PENDING")
      .then((rows) => setLateEntryCount(rows.length))
      .catch(() => setLateEntryCount(null));
  }, [isLeadership, location.pathname]);

  const links = [
    { to: "/", label: "Dashboard", end: true },
    ...(user.role !== "TEACHER" ? [{ to: "/users", label: "Staff" }] : []),
    ...(isLeadership ? [{ to: "/manage", label: "Records" }] : []),
    { to: "/marks", label: "Mark register" },
    { to: "/upload", label: "Bulk upload" },
    ...(isLeadership ? [{ to: "/consolidated", label: "Mark lists" }] : []),
    ...(isLeadership ? [{ to: "/audit", label: "Audit log" }] : []),
    ...(isLeadership ? [{ to: "/late-entry", label: "Late entry", badge: lateEntryCount }] : []),
  ];

  const analysisLinks = [
    ...(isLeadership ? [{ to: "/analysis/school", label: "School" }] : []),
    { to: "/analysis/classes", label: "Classes" },
    ...(isLeadership ? [{ to: "/analysis/subjects", label: "Subjects" }] : []),
    ...(isLeadership ? [{ to: "/analysis/teachers", label: "Teachers" }] : []),
    { to: "/analysis/students", label: "Students" },
    ...(isLeadership ? [{ to: "/analysis/compare", label: "Compare" }] : []),
  ];

  return (
    <div className="h-screen flex overflow-hidden">
      <aside className="h-full w-64 shrink-0 bg-ink-950 text-cream flex flex-col overflow-hidden">
        <div className="px-5 py-6 border-b border-white/10 shrink-0">
          <div className="font-serif text-xl leading-tight">Marks Analytics</div>
          <div className="mt-1 text-xs text-cream/60">School performance suite</div>
        </div>
        <nav className="flex-1 min-h-0 px-3 py-4 space-y-1 overflow-hidden">
          {links.slice(0, 1).map((l) => (
            <SideLink key={l.to} {...l} />
          ))}
          <div>
            <NavLink
              to="/analysis"
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isActive || analysisOpen ? "bg-white/10 text-white" : "text-cream/70 hover:bg-white/5 hover:text-cream"
                }`
              }
            >
              <span>Marks analysis</span>
            </NavLink>
            {(analysisOpen || location.pathname === "/analysis") && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                {analysisLinks.map((l) => (
                  <SideLink key={l.to} {...l} />
                ))}
              </div>
            )}
          </div>
          {isLeadership && (
            <NavLink
              to="/pending-uploads"
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  isActive ? "bg-white/10 text-white" : "text-cream/70 hover:bg-white/5 hover:text-cream"
                }`
              }
            >
              <span>Pending uploads</span>
              {pendingCount != null && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${pendingCount ? "bg-clay-500 text-white" : "bg-white/10 text-cream/70"}`}>
                  {pendingCount}
                </span>
              )}
            </NavLink>
          )}
          {links.slice(1).map((l) => (
            <SideLink key={l.to} {...l} />
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to="/profile" className="text-sm font-medium truncate block hover:text-white">
                {user.name}
              </Link>
              <div className="text-xs text-cream/50">{ROLE_LABEL[user.role]}</div>
            </div>
            <NotificationBell />
          </div>
          <button
            className="mt-3 text-xs text-cream/70 hover:text-white"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SideLink({ to, label, end, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
          isActive ? "bg-white/10 text-white" : "text-cream/70 hover:bg-white/5 hover:text-cream"
        }`
      }
    >
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full px-1.5 py-0.5 text-[10px] bg-clay-500 text-white">{badge}</span>
      )}
    </NavLink>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-700/70">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, to, warn }) {
  const inner = (
    <div className={`card p-4 ${to ? "hover:border-clay-500" : ""} ${warn ? "border-clay-500/40" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-ink-700/60">{label}</div>
      <div className={`mt-1 font-serif text-3xl ${warn ? "text-clay-600" : ""}`}>{value ?? "—"}</div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}
