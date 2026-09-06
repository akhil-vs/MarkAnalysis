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
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog &&
        createPortal(
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
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
              className="relative w-full max-w-md rounded-2xl border border-ink-900/10 bg-cream p-5 shadow-2xl"
            >
              <h2 id="confirm-title" className="font-serif text-2xl text-ink-900">
                {dialog.title}
              </h2>
              <p id="confirm-message" className="mt-2 text-sm leading-relaxed text-ink-700/80">
                {dialog.message}
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => close(false)}>
                  {dialog.cancelLabel}
                </button>
                <button
                  type="button"
                  className={dialog.tone === "danger" ? "btn-primary !bg-clay-600 hover:!bg-clay-700" : "btn-primary"}
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
