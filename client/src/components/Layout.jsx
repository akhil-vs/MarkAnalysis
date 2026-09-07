import { useEffect, useId, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import NotificationBell from "./NotificationBell.jsx";
import PoweredBy from "./PoweredBy.jsx";

const ROLE_LABEL = {
  PRINCIPAL: "Principal",
  EXAM_COORDINATOR: "Exam Coordinator",
  TEACHER: "Teacher",
};

function MenuIcon({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      ) : (
        <>
          <path d="M4 7h16" strokeLinecap="round" />
          <path d="M4 12h16" strokeLinecap="round" />
          <path d="M4 17h16" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(null);
  const [lateEntryCount, setLateEntryCount] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const navId = useId();
  const isLeadership = user.role !== "TEACHER";
  const analysisOpen =
    location.pathname.startsWith("/analysis") ||
    location.pathname.startsWith("/students") ||
    location.pathname.startsWith("/classes");

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") setNavOpen(false);
    }
    function onResize() {
      if (window.matchMedia("(min-width: 1024px)").matches) setNavOpen(false);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [navOpen]);

  useEffect(() => {
    if (!isLeadership) return;
    api("/api/analytics/awaiting-approvals")
      .then((d) => setPendingCount(Number(d.count) || 0))
      .catch(() => {
        api("/api/analytics/pending-uploads")
          .then((d) => setPendingCount((d.pendingTeacherCount ?? 0) + (d.awaitingApprovalTeacherCount ?? 0)))
          .catch(() => setPendingCount(null));
      });
    api("/api/mark-access?status=PENDING")
      .then((rows) => setLateEntryCount(rows.length))
      .catch(() => setLateEntryCount(null));
  }, [isLeadership, location.pathname]);

  const links = [
    { to: "/", label: "Dashboard", end: true },
    ...(user.role !== "TEACHER" ? [{ to: "/users", label: "Staff" }] : []),
    ...(isLeadership ? [{ to: "/manage", label: "Records" }] : []),
    ...(isLeadership ? [{ to: "/school", label: "School" }] : []),
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

  function closeNav() {
    setNavOpen(false);
  }

  const sidebar = (
    <>
      <div className="px-5 py-5 border-b border-white/10 shrink-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-xl leading-tight">Marks Analytics</div>
          <div className="mt-1 text-xs text-cream/60">School performance suite</div>
        </div>
        <button
          type="button"
          className="lg:hidden -mr-1 rounded-lg p-2 text-cream/70 hover:bg-white/5 hover:text-cream"
          aria-label="Close menu"
          onClick={closeNav}
        >
          <MenuIcon open />
        </button>
      </div>
      <nav id={navId} className="flex-1 min-h-0 px-3 py-4 space-y-1 overflow-y-auto overscroll-contain">
        {links.slice(0, 1).map((l) => (
          <SideLink key={l.to} {...l} onNavigate={closeNav} />
        ))}
        <div>
          <NavLink
            to="/analysis"
            onClick={closeNav}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
                isActive || analysisOpen ? "bg-white/10 text-white" : "text-cream/70 hover:bg-white/5 hover:text-cream"
              }`
            }
          >
            <span>Marks analysis</span>
          </NavLink>
          {(analysisOpen || location.pathname === "/analysis") && (
            <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
              {analysisLinks.map((l) => (
                <SideLink key={l.to} {...l} onNavigate={closeNav} />
              ))}
            </div>
          )}
        </div>
        {isLeadership && (
          <NavLink
            to="/pending-uploads"
            onClick={closeNav}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
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
          <SideLink key={l.to} {...l} onNavigate={closeNav} />
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-white/10 shrink-0 safe-pb">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to="/profile" onClick={closeNav} className="text-sm font-medium truncate block hover:text-white">
              {user.name}
            </Link>
            <div className="text-xs text-cream/50">{ROLE_LABEL[user.role]}</div>
          </div>
          <div className="hidden lg:block">
            <NotificationBell />
          </div>
        </div>
        <button
          className="mt-3 text-xs text-cream/70 hover:text-white"
          onClick={() => {
            closeNav();
            logout();
            navigate("/login");
          }}
        >
          Sign out
        </button>
        <div className="mt-4">
          <PoweredBy tone="dark" />
        </div>
      </div>
    </>
  );

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-paper">
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 border-b border-ink-900/10 bg-ink-950 text-cream">
        <div className="safe-pt">
          <div className="flex h-14 items-center gap-2 px-3">
            <button
              type="button"
              className="rounded-lg p-2 text-cream/80 hover:bg-white/5 hover:text-cream"
              aria-label={navOpen ? "Close menu" : "Open menu"}
              aria-expanded={navOpen}
              aria-controls={navId}
              onClick={() => setNavOpen((v) => !v)}
            >
              <MenuIcon open={navOpen} />
            </button>
            <Link to="/" className="min-w-0 flex-1" onClick={closeNav}>
              <div className="font-serif text-lg leading-tight truncate">Marks Analytics</div>
            </Link>
            <NotificationBell />
          </div>
        </div>
      </header>

      {navOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-[1px]"
          aria-label="Close menu overlay"
          onClick={closeNav}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 flex h-full w-[min(18rem,88vw)] shrink-0 flex-col overflow-hidden bg-ink-950 text-cream shadow-2xl transition-transform duration-200 ease-out lg:w-64 lg:shadow-none lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </aside>

      <main className="flex-1 min-w-0 h-full overflow-y-auto overscroll-y-contain pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pt-0">
        <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SideLink({ to, label, end, badge, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
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
    <div className="mb-5 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-2xl sm:text-3xl leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-700/70">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 w-full sm:w-auto">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, to, warn }) {
  const inner = (
    <div className={`card p-3.5 sm:p-4 ${to ? "hover:border-clay-500" : ""} ${warn ? "border-clay-500/40" : ""}`}>
      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-ink-700/60">{label}</div>
      <div className={`mt-1 font-serif text-2xl sm:text-3xl ${warn ? "text-clay-600" : ""}`}>{value ?? "—"}</div>
    </div>
  );
  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}
