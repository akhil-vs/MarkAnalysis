import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function typeLabel(type) {
  if (type === "LATE_ENTRY_APPROVED") return "Late entry approved";
  if (type === "LATE_ENTRY_REJECTED") return "Late entry rejected";
  if (type === "LATE_ENTRY_REQUESTED") return "Late entry requested";
  return null;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api("/api/notifications?limit=20");
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch {
      // keep last known items on transient errors
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    function onFocus() {
      load();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") load();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  useEffect(() => {
    load();
  }, [location.pathname, load]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setCoords(null);
      return;
    }
    function place() {
      const rect = buttonRef.current.getBoundingClientRect();
      const width = 320;
      const margin = 8;
      let left = rect.right + margin;
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, rect.left - width - margin);
      }
      const maxHeight = Math.min(360, window.innerHeight - margin * 2);
      let top = rect.bottom - maxHeight;
      if (top < margin) top = margin;
      setCoords({ top, left, width, maxHeight });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (buttonRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  }

  async function markRead(item) {
    if (!item.readAt) {
      try {
        await api(`/api/notifications/${item.id}/read`, { method: "PATCH" });
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // still navigate if linked
      }
    }
    if (item.link) {
      setOpen(false);
      navigate(item.link);
    }
  }

  async function markAllRead() {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  const panel =
    open && coords
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[200] overflow-hidden rounded-xl border border-white/10 bg-ink-950 text-cream shadow-2xl"
            style={{ top: coords.top, left: coords.left, width: coords.width, maxHeight: coords.maxHeight }}
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="text-sm font-medium">Notifications</div>
              {unreadCount > 0 && (
                <button type="button" className="text-xs text-cream/60 hover:text-cream" onClick={markAllRead}>
                  Mark all read
                </button>
              )}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: coords.maxHeight - 42 }}>
              {loading && !items.length ? (
                <p className="px-3 py-4 text-sm text-cream/50">Loading…</p>
              ) : items.length === 0 ? (
                <p className="px-3 py-4 text-sm text-cream/50">No notifications yet.</p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`block w-full border-b border-white/5 px-3 py-2.5 text-left hover:bg-white/5 ${
                      item.readAt ? "opacity-70" : ""
                    }`}
                    onClick={() => markRead(item)}
                  >
                    <div className="flex items-start gap-2">
                      {!item.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-clay-500" />}
                      <div className={item.readAt ? "pl-3.5" : ""}>
                        <div className="text-sm font-medium leading-snug">{item.title}</div>
                        {typeLabel(item.type) && (
                          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-clay-500/90">
                            {typeLabel(item.type)}
                          </div>
                        )}
                        <div className="mt-0.5 text-xs text-cream/60 leading-snug">{item.body}</div>
                        <div className="mt-1 text-[10px] text-cream/40">{relativeTime(item.createdAt)}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="relative rounded-lg p-2 text-cream/70 hover:bg-white/5 hover:text-cream"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={toggle}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
          <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-clay-500 px-1 text-center text-[10px] leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
