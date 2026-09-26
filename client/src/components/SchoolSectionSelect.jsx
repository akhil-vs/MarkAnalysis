import { SCHOOL_SECTIONS, normalizeSchoolSection } from "../lib/schoolSections.js";

/**
 * Segmented control to scope leadership dashboards by CBSE school section.
 */
export function SchoolSectionSelect({
  value = "ALL",
  options,
  onChange,
  className = "",
  "aria-label": ariaLabel = "School section",
}) {
  const list = options?.length ? options : SCHOOL_SECTIONS;
  const current = normalizeSchoolSection(value);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap rounded-lg border border-ink-900/12 bg-paper/70 p-1 gap-0.5 ${className}`}
    >
      {list.map((opt) => {
        const active = current === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            title={opt.label}
            className={`rounded-md px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition min-h-[2.25rem] ${
              active
                ? "bg-moss-500 text-white shadow-sm"
                : "text-ink-700/70 hover:text-ink-900 hover:bg-white/70"
            }`}
            onClick={() => onChange?.(opt.id)}
          >
            {opt.shortLabel || opt.label}
          </button>
        );
      })}
    </div>
  );
}
