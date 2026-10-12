import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ConfirmContext = createContext(null);

function getFocusable(root) {
  if (!root) return [];
  return [
    ...root.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  const confirm = useCallback((options) => {
    const opts = typeof options === "string" ? { message: options } : options || {};
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      previouslyFocused.current = document.activeElement;
      setDialog({
        title: opts.title || "Please confirm",
        message: opts.message || "Are you sure?",
        confirmLabel: opts.confirmLabel || "Confirm",
        cancelLabel: opts.cancelLabel || "Cancel",
        tone: opts.tone || "primary",
      });
    });
  }, []);

  function close(result) {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDialog(null);
    const prev = previouslyFocused.current;
    previouslyFocused.current = null;
    if (prev && typeof prev.focus === "function") {
      queueMicrotask(() => prev.focus());
    }
    resolve?.(result);
  }

  useEffect(() => {
    if (!dialog) return;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusable(panelRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    queueMicrotask(() => {
      const focusable = getFocusable(panelRef.current);
      const preferred =
        focusable.find((el) => el.dataset?.confirmPrimary === "true") || focusable[focusable.length - 1];
      preferred?.focus();
    });
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [dialog]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog &&
        createPortal(
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <button
              type="button"
              className="absolute inset-0 bg-ink-950/45"
              aria-label="Dismiss"
              onClick={() => close(false)}
            />
            <div
              ref={panelRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              aria-describedby="confirm-message"
              className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-ink-900/10 bg-cream p-5 shadow-2xl safe-pb"
            >
              <h2 id="confirm-title" className="font-serif text-2xl text-ink-900">
                {dialog.title}
              </h2>
              <p id="confirm-message" className="mt-2 text-sm leading-relaxed text-ink-700/80 break-words">
                {dialog.message}
              </p>
              <div className="mt-5 flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-2">
                <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => close(false)}>
                  {dialog.cancelLabel}
                </button>
                <button
                  type="button"
                  data-confirm-primary="true"
                  className={`w-full sm:w-auto ${dialog.tone === "danger" ? "btn-primary !bg-clay-600 hover:!bg-clay-700" : "btn-primary"}`}
                  onClick={() => close(true)}
                >
                  {dialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return confirm;
}
