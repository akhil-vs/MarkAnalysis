/**
 * Compact search + optional filter controls for tables.
 * Controls size to content and wrap; they do not stretch full page width.
 */
export function TableToolbar({
  q,
  setQ,
  placeholder = "Search…",
  children,
  className = "",
  matched,
  total,
}) {
  const showCount = typeof matched === "number" && typeof total === "number" && (q?.trim() || matched !== total);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <input
        type="search"
        className="field-search"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={placeholder}
      />
      {children}
      {showCount && (
        <span className="text-xs text-ink-700/55 whitespace-nowrap sm:ml-auto">
          {matched === 0 ? "No matches" : `${matched} of ${total}`}
        </span>
      )}
    </div>
  );
}

/**
 * Horizontal filter strip: fields stay compact and wrap on narrow viewports.
 */
export function FilterBar({ children, className = "" }) {
  return (
    <div className={`flex flex-wrap items-end gap-2.5 sm:gap-3 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Labeled filter control with a constrained width so grids don’t stretch edge-to-edge.
 */
export function FilterField({ label, className = "", children }) {
  return (
    <label
      className={`block min-w-0 grow basis-[calc(50%-0.35rem)] sm:grow-0 sm:basis-auto sm:min-w-[9.5rem] sm:max-w-[13.5rem] ${className}`}
    >
      {label ? <span className="label">{label}</span> : null}
      {children}
    </label>
  );
}
