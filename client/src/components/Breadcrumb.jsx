import { Link } from "react-router-dom";

/**
 * Simple trail for nested analysis / detail pages.
 * @param {{ items: Array<{ label: string, to?: string }> }} props
 */
export default function Breadcrumb({ items }) {
  if (!items?.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs text-ink-700/60">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <span aria-hidden="true" className="text-ink-700/35">/</span>}
              {item.to && !last ? (
                <Link to={item.to} className="truncate hover:text-ink-900 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className={`truncate ${last ? "text-ink-700/80" : ""}`} aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
