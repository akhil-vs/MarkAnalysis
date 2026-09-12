/**
 * Parse page / pageSize / q from a query object.
 * Callers that omit `page` keep legacy "return everything" behaviour.
 */
export function parsePageQuery(query = {}, { defaultSize = 25, maxSize = 100 } = {}) {
  const hasPage = query.page != null && String(query.page).trim() !== "";
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const rawSize = Number.parseInt(query.pageSize ?? query.limit, 10);
  const pageSize = Math.min(maxSize, Math.max(1, Number.isFinite(rawSize) ? rawSize : defaultSize));
  const q = String(query.q || query.search || "").trim();
  return {
    paged: hasPage,
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
