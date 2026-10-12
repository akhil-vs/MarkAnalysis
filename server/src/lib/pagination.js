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

/**
 * Parse cursor-based pagination query parameters.
 * 
 * Cursor pagination is more efficient for large datasets as it doesn't
 * require counting total rows or calculating offsets.
 * 
 * @param {object} query - Request query object
 * @param {object} options - Pagination options
 * @param {number} [options.defaultSize=50] - Default page size
 * @param {number} [options.maxSize=100] - Maximum page size
 * @returns {object} Pagination parameters for Prisma
 */
export function parseCursorQuery(query = {}, options = {}) {
  const defaultSize = options.defaultSize || 50;
  const maxSize = options.maxSize || 100;
  
  const limit = Math.min(
    maxSize,
    Math.max(1, parseInt(query.limit) || defaultSize)
  );
  
  const result = {
    take: limit + 1, // Fetch one extra to determine if there's more
  };
  
  if (query.cursor) {
    result.cursor = { id: query.cursor };
    result.skip = 1; // Skip the cursor itself
  }
  
  return result;
}

/**
 * Process cursor-based pagination results.
 * 
 * @param {Array} items - Query results (should include one extra item)
 * @param {number} take - Requested page size (without the +1)
 * @returns {object} Paginated result with items, hasMore, and nextCursor
 */
export function cursorResult(items, take) {
  const hasMore = items.length > take;
  const results = hasMore ? items.slice(0, -1) : items;
  const nextCursor = hasMore && results.length > 0 
    ? results[results.length - 1].id 
    : null;
  
  return {
    items: results,
    hasMore,
    nextCursor,
    pageSize: results.length,
  };
}

/**
 * Helper to build cursor pagination query parameters.
 * 
 * @param {string|null} cursor - Current cursor position
 * @param {number} [limit=50] - Page size
 * @returns {string} URL query string
 */
export function buildCursorQuery(cursor, limit = 50) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return params.toString();
}
