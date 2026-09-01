import { useEffect, useMemo, useState } from "react";

export function usePagination(items = [], { pageSize: initialSize = 10, resetKey } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize, total]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const current = Math.min(page, pageCount);
  const slice = useMemo(
    () => list.slice((current - 1) * pageSize, current * pageSize),
    [list, current, pageSize]
  );

  return { slice, page: current, setPage, pageCount, pageSize, setPageSize, total };
}

function pageItems(current, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const wanted = new Set([1, pageCount, current - 1, current, current + 1]);
  const nums = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out = [];
  for (const n of nums) {
    if (out.length && n - out[out.length - 1] > 1) out.push("…");
    out.push(n);
  }
  return out;
}

export function PaginationBar({
  total,
  page,
  pageCount,
  pageSize,
  setPage,
  setPageSize,
  pageSizeOptions = [10, 25, 50],
  empty = "No rows yet.",
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 px-3 py-3 border-t border-ink-900/10 text-sm text-ink-700/70">
      <div className="flex flex-wrap items-center gap-3">
        <span>{total === 0 ? empty : `Showing ${start}–${end} of ${total}`}</span>
        <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-700/55">
          Rows
          <select
            className="field w-auto py-1 text-sm normal-case tracking-normal"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1" role="navigation" aria-label="Pagination">
        <button type="button" className="pager-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Prev
        </button>
        {pageItems(page, pageCount).map((item, i) =>
          item === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-ink-700/40">…</span>
          ) : (
            <button
              type="button"
              key={item}
              className={`pager-btn ${item === page ? "pager-btn-active" : ""}`}
              onClick={() => setPage(item)}
              aria-current={item === page ? "page" : undefined}
            >
              {item}
            </button>
          )
        )}
        <button type="button" className="pager-btn" disabled={page >= pageCount || total === 0} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function PaginatedTable({
  items = [],
  pageSize = 10,
  pageSizeOptions = [10, 25, 50],
  resetKey,
  empty = "No rows yet.",
  className = "",
  children,
}) {
  const pagination = usePagination(items, { pageSize, resetKey });

  return (
    <div className={className}>
      <div className="overflow-x-auto">{children(pagination.slice, pagination)}</div>
      <PaginationBar {...pagination} pageSizeOptions={pageSizeOptions} empty={empty} />
    </div>
  );
}
