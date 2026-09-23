import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";

/**
 * Load configured academic years from the school profile (cached via api.js).
 * Returns { years, current, loading }. years is [] when none are configured.
 */
export function useAcademicYears() {
  const [years, setYears] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api("/api/school")
      .then((s) => {
        if (cancelled) return;
        const list = Array.isArray(s?.academicYears) ? s.academicYears.filter(Boolean) : [];
        setYears(list);
        setCurrent(s?.currentAcademicYear || list[0] || null);
      })
      .catch(() => {
        if (!cancelled) {
          setYears([]);
          setCurrent(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { years, current, loading };
}

/**
 * Merge school-configured years with extra years seen in data (filters / legacy rows).
 * Newest first.
 */
export function mergeYearOptions(configured = [], extras = []) {
  const seen = new Set();
  const out = [];
  for (const list of [configured, extras]) {
    for (const y of list || []) {
      const text = String(y || "").trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
  }
  return out.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * Academic year control: select from school-saved years when any exist,
 * otherwise a free-text field (legacy / first-time schools).
 */
export function AcademicYearField({
  value,
  onChange,
  required = false,
  disabled = false,
  className = "field",
  placeholder = "e.g. 2025-26",
  emptyLabel = "Select academic year",
  allowEmpty = false,
  id,
  name,
  title = "Use a year like 2025-26",
  /** Extra options (e.g. years already on records) merged into the select. */
  extraOptions = [],
  /** When true and years exist, prefer select even if value is empty. */
  preferSelect = true,
}) {
  const { years: configured, current, loading } = useAcademicYears();
  const options = useMemo(
    () => mergeYearOptions(configured, extraOptions),
    [configured, extraOptions]
  );
  const useSelect = preferSelect && options.length > 0;
  const seededRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (seededRef.current || loading || !useSelect) return;
    if (value) {
      seededRef.current = true;
      return;
    }
    if (required && current) {
      seededRef.current = true;
      onChangeRef.current(current);
    }
  }, [loading, useSelect, value, required, current]);

  if (useSelect) {
    const showEmpty = allowEmpty || (!required && !value) || (!value && !current);
    return (
      <select
        id={id}
        name={name}
        className={className}
        required={required}
        disabled={disabled || loading}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        aria-label="Academic year"
      >
        {showEmpty && <option value="">{emptyLabel}</option>}
        {options.map((y) => (
          <option key={y} value={y}>
            {y}
            {y === current ? " (current)" : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={id}
      name={name}
      className={className}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      pattern="\d{4}-\d{2}"
      title={title}
      aria-label="Academic year"
    />
  );
}

/** Filter dropdown that prefers school-saved years, merging in data-derived years. */
export function AcademicYearFilter({
  value,
  onChange,
  dataYears = [],
  className = "field-filter",
  allLabel = "All years",
  disabled = false,
}) {
  const { years: configured, current } = useAcademicYears();
  const options = useMemo(
    () => mergeYearOptions(configured, dataYears),
    [configured, dataYears]
  );

  return (
    <select
      className={className}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter by academic year"
    >
      <option value="">{allLabel}</option>
      {options.map((y) => (
        <option key={y} value={y}>
          {y}
          {y === current ? " (current)" : ""}
        </option>
      ))}
    </select>
  );
}
