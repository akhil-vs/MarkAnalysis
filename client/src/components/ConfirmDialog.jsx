import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    const opts = typeof options === "string" ? { message: options } : options || {};
    return new Promise((resolve) => {
      resolveRef.current = resolve;
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
    resolve?.(result);
  }

  useEffect(() => {
    if (!dialog) return;
    function onKey(e) {
      if (e.key === "Escape") close(false);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
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
                  className={`w-full sm:w-auto ${dialog.tone === "danger" ? "btn-primary !bg-clay-600 hover:!bg-clay-700" : "btn-primary"}`}
                  onClick={() => close(true)}
                  autoFocus
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
