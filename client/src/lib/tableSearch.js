import { useMemo, useState } from "react";

const EMPTY_FILTERS = {};
const EMPTY_DEFS = [];
const EMPTY_ITEMS = [];

/** Normalize any value into searchable lowercase text. */
export function searchHaystack(...parts) {
  return parts
    .flat(Infinity)
    .filter((p) => p != null && p !== "")
    .map((p) => String(p))
    .join(" ")
    .toLowerCase();
}

/**
 * Client-side text search + optional discrete filters for table rows.
 *
 * @param {Array} items
 * @param {object} options
 * @param {(item: any) => string} options.getSearchText - text to match against the query
 * @param {Record<string, string>} [options.initialFilters]
 * @param {Array<{ key: string, match: (item: any, value: string) => boolean }>} [options.filterDefs]
 */
export function useTableSearch(
  items,
  { getSearchText, initialFilters = EMPTY_FILTERS, filterDefs = EMPTY_DEFS } = {}
) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const list = Array.isArray(items) ? items : EMPTY_ITEMS;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((item) => {
      for (const def of filterDefs) {
        const value = filters[def.key] ?? "";
        if (value !== "" && !def.match(item, value)) return false;
      }
      if (!needle) return true;
      const text = getSearchText ? getSearchText(item) : searchHaystack(item);
      return text.toLowerCase().includes(needle);
    });
    // getSearchText / filterDefs are expected to be stable or cheap to re-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, q, filters]);

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filterKey = Object.keys(filters)
    .sort()
    .map((k) => `${k}:${filters[k] ?? ""}`)
    .join("|");
  const resetKey = `${q}|${filterKey}`;

  return {
    q,
    setQ,
    filters,
    setFilter,
    setFilters,
    filtered,
    resetKey,
    total: list.length,
    matched: filtered.length,
  };
}
