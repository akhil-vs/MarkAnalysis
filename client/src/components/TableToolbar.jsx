/**
 * Search input + optional filter controls for tables.
 * Place above a PaginatedTable (inside or just above the card).
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
    <div className={`flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 ${className}`}>
      <input
        type="search"
        className="field w-full sm:max-w-xs sm:flex-1"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={placeholder}
      />
      {children}
      {showCount && (
        <span className="text-xs text-ink-700/55 sm:ml-auto whitespace-nowrap">
          {matched === 0 ? "No matches" : `${matched} of ${total}`}
        </span>
      )}
    </div>
  );
}
