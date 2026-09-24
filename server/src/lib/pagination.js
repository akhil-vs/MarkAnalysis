/**
 * Parse page / pageSize / q from a query object.
 *
 * - Omit `page` → legacy unpaged (full list) unless `defaultPaged` is true.
 * - `pageSize=all` → force unpaged even when defaultPaged.
 * - Pass `page` → paged mode with skip/take.
 */
export function parsePageQuery(query = {}, { defaultSize = 25, maxSize = 100, defaultPaged = false } = {}) {
  const allRequested = ["all", "*"].includes(String(query.pageSize ?? query.limit ?? "").trim().toLowerCase());
  const hasPage = query.page != null && String(query.page).trim() !== "";
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawSize = Number.parseInt(query.pageSize ?? query.limit, 10);
  const pageSize = Math.min(maxSize, Math.max(1, Number.isFinite(rawSize) ? rawSize : defaultSize));
  const q = String(query.q || query.search || "").trim();
  const paged = allRequested ? false : hasPage || Boolean(defaultPaged);
  return {
    paged,
    page,
    pageSize,
    q,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function pageResult({ items, total, page, pageSize }) {
  const safeTotal = Number(total) || 0;
  const safeSize = Math.max(1, pageSize || 1);
  return {
    items,
    total: safeTotal,
    page,
    pageSize: safeSize,
    pageCount: Math.max(1, Math.ceil(safeTotal / safeSize)),
  };
}
