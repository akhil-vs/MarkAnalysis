import { useEffect, useId, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { isAnalysisPath, navGroupsForRole } from "../lib/nav.js";
import { isLeadership } from "../lib/roles.js";
import { PageHelpHint } from "./HelpHint.jsx";
import NotificationBell, { NotificationProvider } from "./NotificationBell.jsx";
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

const NAV_ICON_PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </>
  ),
  analysis: (
    <>
      <path d="M4 19V5" strokeLinecap="round" />
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M8 16v-5" strokeLinecap="round" />
      <path d="M12 16V8" strokeLinecap="round" />
      <path d="M16 16v-8" strokeLinecap="round" />
    </>
  ),
  pending: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  staff: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 19a4.5 4.5 0 0 1 5.5-4.2" strokeLinecap="round" />
    </>
  ),
  records: (
    <>
      <path d="M5 4h10l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      <path d="M14 4v4h4" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h5" strokeLinecap="round" />
    </>
  ),
  school: (
    <>
      <path d="M3 21h18" strokeLinecap="round" />
      <path d="M5 21V9l7-5 7 5v12" strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" strokeLinejoin="round" />
      <path d="M9 12h.01M15 12h.01" strokeLinecap="round" />
    </>
  ),
  register: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V7" strokeLinecap="round" />
      <path d="M8.5 10.5 12 7l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </>
  ),
  lists: (
    <>
      <path d="M8 7h12M8 12h12M8 17h12" strokeLinecap="round" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" strokeLinecap="round" />
    </>
  ),
  audit: (
    <>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinejoin="round" />
      <path d="M9 13h6M9 17h4" strokeLinecap="round" />
    </>
  ),
  late: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 5.5 18 4" strokeLinecap="round" />
    </>
  ),
  classes: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 10h18" strokeLinecap="round" />
      <path d="M8 14h.01M12 14h.01M16 14h.01" strokeLinecap="round" />
    </>
  ),
  subjects: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5z" strokeLinejoin="round" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5A2.5 2.5 0 0 1 20 21.5z" strokeLinejoin="round" />
    </>
  ),
  teachers: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
      <path d="M12 11.5v2" strokeLinecap="round" />
    </>
  ),
  timetable: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <path d="M3 10h18" strokeLinecap="round" />
      <path d="M8 3v4M16 3v4" strokeLinecap="round" />
      <path d="M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2" strokeLinecap="round" />
    </>
  ),
  students: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5z" strokeLinejoin="round" />
      <path d="M5 11.5V17c0 .8 3.1 3 7 3s7-2.2 7-3v-5.5" strokeLinejoin="round" />
    </>
  ),
  compare: (
    <>
      <path d="M7 7h10" strokeLinecap="round" />
      <path d="M14 4l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17H7" strokeLinecap="round" />
      <path d="M10 14l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

function NavIcon({ name, size = 16 }) {
  const paths = NAV_ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="shrink-0 opacity-80"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

export default function Layout() {
  const { user, logout, classTeacherOf } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(null);
  const [lateEntryCount, setLateEntryCount] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const navId = useId();
  const leadership = isLeadership(user.role);
  const analysisOpen = isAnalysisPath(location.pathname);
  const groups = navGroupsForRole(user.role, { classTeacherOf });

  const badges = { pending: pendingCount, lateEntry: lateEntryCount };

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
    if (!leadership) return;
    let cancelled = false;

    async function loadBadges() {
      try {
        const d = await api("/api/analytics/awaiting-approvals?countOnly=1");
        if (!cancelled) setPendingCount(Number(d.count) || 0);
      } catch {
        try {
          const d = await api("/api/analytics/pending-uploads");
          if (!cancelled) {
            setPendingCount((d.pendingTeacherCount ?? 0) + (d.awaitingApprovalTeacherCount ?? 0));
          }
        } catch {
          if (!cancelled) setPendingCount(null);
        }
      }
      try {
        const d = await api("/api/mark-access/count?status=PENDING");
        if (!cancelled) setLateEntryCount(Number(d.count) || 0);
      } catch {
        try {
          const rows = await api("/api/mark-access?status=PENDING");
          if (!cancelled) setLateEntryCount(Array.isArray(rows) ? rows.length : 0);
        } catch {
          if (!cancelled) setLateEntryCount(null);
        }
      }
    }

    loadBadges();
    const id = setInterval(loadBadges, 60000);
    function onFocus() {
      loadBadges();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") loadBadges();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [leadership]);

  function closeNav() {
    setNavOpen(false);
  }

  const sidebar = (
    <>
      <div className="px-5 py-5 border-b border-white/10 shrink-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-xl leading-tight">Marks Analytics</div>
          <div className="mt-1 text-xs text-cream/60 truncate">
            {user.school?.name || "School performance suite"}
          </div>
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
      <nav id={navId} className="flex-1 min-h-0 px-3 py-4 space-y-4 overflow-y-auto overscroll-contain">
        {groups.map((group) => (
          <div key={group.id}>
            {group.label && (
              <div className="px-3 mb-1.5 text-[10px] font-medium uppercase tracking-wider text-cream/40">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) =>
                item.expandable ? (
                  <AnalysisNav
                    key={item.id}
                    item={item}
                    analysisOpen={analysisOpen}
                    pathname={location.pathname}
                    onNavigate={closeNav}
                  />
                ) : (
                  <SideLink
                    key={item.id}
                    to={item.to}
                    label={item.label}
                    end={item.end}
                    icon={item.icon}
                    badge={item.badgeKey ? badges[item.badgeKey] : null}
                    showZeroBadge={item.badgeKey === "pending"}
                    onNavigate={closeNav}
                  />
                )
              )}
            </div>
          </div>
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
    <NotificationProvider>
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
    </NotificationProvider>
  );
}

function AnalysisNav({ item, analysisOpen, pathname, onNavigate }) {
  const open = analysisOpen || pathname === item.to;
  return (
    <div>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
            isActive || analysisOpen ? "bg-white/10 text-white" : "text-cream/70 hover:bg-white/5 hover:text-cream"
          }`
        }
      >
        <NavIcon name={item.icon} />
        <span>{item.label}</span>
      </NavLink>
      {open && item.children?.length > 0 && (
        <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
          {item.children.map((child) => (
            <SideLink key={child.id} to={child.to} label={child.label} icon={child.icon} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function SideLink({ to, label, end, badge, icon, onNavigate, showZeroBadge }) {
  const showBadge = badge != null && (showZeroBadge || badge > 0);
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm ${
          isActive ? "bg-white/10 text-white" : "text-cream/70 hover:bg-white/5 hover:text-cream"
        }`
      }
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {icon && <NavIcon name={icon} />}
        <span className="truncate">{label}</span>
      </span>
      {showBadge && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
            badge > 0 ? "bg-clay-500 text-white" : "bg-white/10 text-cream/70"
          }`}
        >
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb, help }) {
  return (
    <div className="mb-5 sm:mb-6">
      {breadcrumb}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl sm:text-3xl leading-tight flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            <PageHelpHint help={help} />
          </h1>
          {subtitle && <p className="mt-1 text-sm text-ink-700/70">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:max-w-none sm:justify-end">{actions}</div>
        )}
      </div>
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
