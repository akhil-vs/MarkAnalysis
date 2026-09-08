import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ToastContext = createContext(null);

let toastId = 0;

const TONE = {
  success: {
    wrap: "border-moss-500/25 bg-[#eef5f0] text-moss-700",
    icon: "text-moss-600",
  },
  error: {
    wrap: "border-clay-500/30 bg-[#fbf4ec] text-clay-700",
    icon: "text-clay-600",
  },
  info: {
    wrap: "border-ink-900/10 bg-cream text-ink-800",
    icon: "text-ink-700/70",
  },
};

function ToastIcon({ tone }) {
  if (tone === "success") {
    return (
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (tone === "error") {
    return (
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Lightweight global toast stack (no third-party dependency).
 * Use for mutation outcomes; keep field-level form errors inline.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone, message, options = {}) => {
      const text = String(message || "").trim();
      if (!text) return;
      const id = ++toastId;
      const duration = options.duration ?? (tone === "error" ? 5000 : 3500);
      setToasts((prev) => [...prev.slice(-4), { id, tone, message: text }]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (message, options) => push("success", message, options),
      error: (message, options) => push("error", message, options),
      info: (message, options) => push("info", message, options),
      dismiss,
    }),
    [push, dismiss]
  );

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[250] flex flex-col items-stretch gap-2 p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm sm:items-end safe-pb"
          aria-live="polite"
          aria-relevant="additions"
        >
          {toasts.map((t) => {
            const style = TONE[t.tone] || TONE.info;
            return (
              <div
                key={t.id}
                role={t.tone === "error" ? "alert" : "status"}
                className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg ${style.wrap}`}
              >
                <span className={`mt-0.5 ${style.icon}`}>
                  <ToastIcon tone={t.tone} />
                </span>
                <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
                <button
                  type="button"
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium opacity-60 hover:opacity-100"
                  aria-label="Dismiss"
                  onClick={() => dismiss(t.id)}
                >
                  Close
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return toast;
}
