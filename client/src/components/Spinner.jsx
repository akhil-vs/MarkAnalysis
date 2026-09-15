/**
 * Inline SVG spinner for buttons and table busy overlays.
 */
export function Spinner({ className = "h-4 w-4", label = "Loading" }) {
  return (
    <svg
      className={`animate-spin shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={label ? undefined : true}
      role={label ? "status" : undefined}
      aria-label={label || undefined}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
      {label ? <title>{label}</title> : null}
    </svg>
  );
}

/** Compact spinner + label for action buttons during mutations. */
export function BusyLabel({ busy, idle, busyText, className = "" }) {
  if (!busy) return idle;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Spinner className="h-3.5 w-3.5" label="" />
      <span>{busyText}</span>
    </span>
  );
}

/** Full-page / block loading placeholder with spinner. */
export function LoadingState({ label = "Loading…", className = "" }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 p-10 text-ink-700/70 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Spinner className="h-4 w-4 text-ink-900" label="" />
      <span>{label}</span>
    </div>
  );
}

/** Compact inline spinner + label for nested panels and dialogs. */
export function InlineLoading({ label = "Loading…", className = "" }) {
  return (
    <p
      className={`inline-flex items-center gap-2 text-sm text-ink-700/60 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-3.5 w-3.5 shrink-0" label="" />
      <span>{label}</span>
    </p>
  );
}
