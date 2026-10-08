import { NavLink } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { isLeadership } from "../lib/roles.js";

/**
 * Bottom task bar for phones — Home / Papers (or Approvals) / Profile.
 */
export default function MobileTaskBar() {
  const { user } = useAuth();
  if (!user || user.role === "PLATFORM_ADMIN") return null;

  const leadership = isLeadership(user.role);
  const mid = leadership
    ? { to: "/approvals", label: "Approvals" }
    : { to: "/marks", label: "Papers" };

  const itemCls = ({ isActive }) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] uppercase tracking-wide ${
      isActive ? "text-clay-600" : "text-ink-700/55"
    }`;

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-ink-900/10 bg-cream/95 backdrop-blur safe-pb"
      aria-label="Quick tasks"
    >
      <div className="mx-auto flex max-w-lg">
        <NavLink to="/" end className={itemCls}>
          Home
        </NavLink>
        <NavLink to={mid.to} className={itemCls}>
          {mid.label}
        </NavLink>
        <NavLink to="/profile" className={itemCls}>
          Profile
        </NavLink>
      </div>
    </nav>
  );
}
