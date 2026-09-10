import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { helpForPath } from "../lib/pageHelp.js";

function HintIcon({ size }) {
  const px = size === "sm" ? 16 : 20;
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9.6 9.4a2.4 2.4 0 1 1 3.3 2.22c-.7.3-1.1.8-1.1 1.58V14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function HelpHint({ help, label = "What's on this page", size = "md", tone = "default" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const titleId = useId();

  const about = typeof help === "string" ? help : help?.about;
  const useful = typeof help === "string" ? "" : help?.useful;
  const heading = typeof help === "string" ? "What's on this page" : help?.title || "What's on this page";

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function place() {
      const btn = wrapRef.current?.querySelector("button");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - 16);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
      if (left < 8) left = 8;
      const estimatedHeight = panelRef.current?.offsetHeight || 220;
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const top = spaceBelow < estimatedHeight && rect.top > estimatedHeight + 12
        ? rect.top - estimatedHeight - 8
        : rect.bottom + 8;
      setCoords({ top, left, width });
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
    function onPointer(e) {
      const t = e.target;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!about && !useful) return null;

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        className={`inline-flex items-center justify-center rounded-full hover:bg-clay-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500/40 ${
          size === "sm" ? "h-6 w-6" : "h-7 w-7"
        } ${
          tone === "onDark"
            ? open
              ? "text-cream bg-white/15"
              : "text-cream/70 hover:text-cream hover:bg-white/10"
            : open
              ? "text-clay-600 bg-clay-500/10"
              : "text-ink-700/45 hover:text-clay-600"
        }`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <HintIcon size={size} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-labelledby={titleId}
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? 8,
              width: coords?.width ?? 320,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-[200] rounded-xl border border-ink-900/10 bg-cream p-3.5 shadow-lg"
          >
            <div className="font-serif text-base leading-tight text-ink-900" id={titleId}>
              {heading}
            </div>
            {about && <p className="mt-2 text-sm leading-relaxed text-ink-700/80">{about}</p>}
            {useful && (
              <div className="mt-3 pt-3 border-t border-ink-900/10">
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-700/50">How it is useful</div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-700/80">{useful}</p>
              </div>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}

/** Resolve page help from the current route, or an explicit override. */
export function usePageHelp(override) {
  const location = useLocation();
  const { user } = useAuth();
  if (override === false) return null;
  if (override && typeof override === "object") return override;
  if (typeof override === "string") return { about: override };
  return helpForPath(location.pathname, user?.role);
}

export function PageHelpHint({ help, label, size }) {
  const resolved = usePageHelp(help);
  return <HelpHint help={resolved} label={label} size={size} />;
}
