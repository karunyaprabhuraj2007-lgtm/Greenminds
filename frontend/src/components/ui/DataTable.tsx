import { useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { Button } from "./Button";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Value used for sorting and text filtering (defaults to no sort). */
  value?: (row: T) => string | number | null | undefined;
  align?: "left" | "right";
  width?: string;
}

const ROW_H = 44;
const VIRTUAL_THRESHOLD = 150;

/**
 * Sortable, filterable, paginated table with a sticky header. Large pages
 * (more than 150 rows) are windowed so only visible rows are rendered.
 */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, pageSize = 25, filterPlaceholder = "Filter…",
  empty, toolbar, initialSort, maxHeight = "calc(100vh - 260px)" }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; pageSize?: number;
  filterPlaceholder?: string; empty?: ReactNode; toolbar?: ReactNode; initialSort?: { key: string; dir: "asc" | "desc" }; maxHeight?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [scrollTop, setScrollTop] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q
      ? rows.filter((r) => columns.some((c) => c.value && String(c.value(r) ?? "").toLowerCase().includes(q)))
      : rows.slice();
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.value) {
        out.sort((a, b) => {
          const va = col.value!(a), vb = col.value!(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, columns, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages);
  const pageRows = filtered.slice((current - 1) * size, current * size);
  const virtual = pageRows.length > VIRTUAL_THRESHOLD;
  const viewport = scroller.current?.clientHeight ?? 600;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_H) - 10) : 0;
  const end = virtual ? Math.min(pageRows.length, start + Math.ceil(viewport / ROW_H) + 20) : pageRows.length;

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input h-9 pl-8" placeholder={filterPlaceholder} value={query} aria-label="Filter rows"
            onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        </div>
        <span className="num text-xs text-slate-500">{filtered.length.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")}</span>
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>
      <div ref={scroller} className="overflow-auto" style={{ maxHeight }} onScroll={(e) => virtual && setScrollTop(e.currentTarget.scrollTop)}>
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" style={{ width: c.width }}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.value ? (
                      <button className={`inline-flex items-center gap-1 hover:text-navy ${c.align === "right" ? "flex-row-reverse" : ""}`} onClick={() => toggleSort(c.key)}>
                        {c.header}
                        <Icon name={active ? (sort!.dir === "asc" ? "sortAsc" : "sortDesc") : "sort"} className={`h-3 w-3 ${active ? "text-navy" : "text-slate-300"}`} />
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {virtual && start > 0 && <tr style={{ height: start * ROW_H }} aria-hidden />}
            {pageRows.slice(start, end).map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`${onRowClick ? "cursor-pointer hover:bg-slate-50 focus-visible:bg-navy-50" : ""}`} style={{ height: ROW_H }}>
                {columns.map((c) => (
                  <td key={c.key} className={`border-b border-slate-100 px-4 py-2 ${c.align === "right" ? "num text-right" : ""}`}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
            {virtual && end < pageRows.length && <tr style={{ height: (pageRows.length - end) * ROW_H }} aria-hidden />}
          </tbody>
        </table>
        {!filtered.length && (empty ?? <p className="px-4 py-8 text-center text-sm text-slate-500">{query ? "No rows match the filter." : "Nothing here yet."}</p>)}
      </div>
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
          <label className="flex items-center gap-2">
            Rows per page
            <select className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs" value={size}
              onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
              {[25, 50, 100, 500].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <span className="num">Page {current} of {pages}</span>
            <Button size="sm" icon="chevronLeft" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)} />
            <Button size="sm" icon="chevronRight" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)} />
          </div>
        </div>
      )}
    </div>
  );
}
