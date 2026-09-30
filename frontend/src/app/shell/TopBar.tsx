import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Kbd } from "../../components/ui/Kbd";
import { useCrumbs } from "../page";
import { UserMenu } from "./UserMenu";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar({ onSearch, onShortcuts }: { onSearch: () => void; onShortcuts: () => void }) {
  const crumbs = useCrumbs();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            const body = last ? (
              <span aria-current="page" className="truncate font-semibold text-navy">{c.label}</span>
            ) : c.to ? (
              <Link to={c.to} className="truncate text-slate-500 hover:text-navy">{c.label}</Link>
            ) : c.onClick ? (
              <button onClick={c.onClick} className="truncate text-slate-500 hover:text-navy">{c.label}</button>
            ) : (
              <span className="truncate text-slate-500">{c.label}</span>
            );
            return (
              <li key={`${i}-${c.label}`} className={`flex min-w-0 items-center gap-1.5 ${last ? "" : "shrink-0"}`}>
                {i > 0 && <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                {body}
              </li>
            );
          })}
        </ol>
      </nav>
      <button onClick={onSearch} className="hidden h-9 w-72 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 hover:border-slate-300 hover:bg-white sm:flex" aria-label="Search (Ctrl+K)">
        <Icon name="search" className="h-4 w-4" />
        <span className="flex-1 truncate whitespace-nowrap text-left">Search places, surveys, plots…</span>
        <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd>
      </button>
      <button onClick={onSearch} className="sm:hidden" aria-label="Search"><Icon name="search" /></button>
      <UserMenu onShortcuts={onShortcuts} />
    </header>
  );
}
