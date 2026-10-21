import { useEffect, useState } from "react";

/** Standard page size for lists that can grow without bound (goals, archive, tracked activity). */
const PAGE_SIZE = 10;

/** Current page clamped to the list length; resets to the first page whenever `resetKey` changes. */
export function usePage<T>(items: T[], resetKey: unknown = null) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return { page: current, pages, visible, setPage };
}

/** Numbered page buttons under a long list. Renders nothing for a single page. */
export function Pager({
  page,
  pages,
  onChange,
  label,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label={`${label} pages`}>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className="text-button"
          aria-current={n === page ? "page" : undefined}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </nav>
  );
}
