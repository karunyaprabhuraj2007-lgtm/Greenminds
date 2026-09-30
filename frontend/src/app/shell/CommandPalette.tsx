import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../../components/Icon";
import { Kbd } from "../../components/ui/Kbd";
import { get } from "../api";
import { useAuth } from "../auth";
import { visibleNav } from "../nav";
import type { SearchResult } from "../types";

interface Entry { id: string; label: string; sublabel?: string; icon: IconName; group: string; go: () => void }

const TYPE_ICON: Record<SearchResult["type"], IconName> = {
  district: "map", taluka: "map", village: "map", survey: "surveys", plot: "polygon", crop: "leaf", coordinate: "pin",
};

/** Target URL for a search result. */
export function resultPath(r: SearchResult): string {
  switch (r.type) {
    case "survey": return `/surveys/${r.id}`;
    case "plot": return `/map?survey=${r.survey_id}&plot=${r.id}`;
    case "crop": return `/map?survey=${r.survey_id}`;
    case "coordinate": return `/map?lat=${r.point![1]}&lon=${r.point![0]}`;
    default: return `/map?level=${r.type}&id=${r.id}`;
  }
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setResults([]); setActive(0); setTimeout(() => input.current?.focus(), 0); }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term || !(can("view_map") || can("create_survey"))) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      get<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => { setResults(r.results); setActive(0); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, can]);

  const entries = useMemo<Entry[]>(() => {
    const go = (path: string) => () => { navigate(path); onClose(); };
    const term = q.trim().toLowerCase();
    const pages = visibleNav(can)
      .filter((n) => !term || n.label.toLowerCase().includes(term))
      .map((n) => ({ id: `nav-${n.to}`, label: n.label, icon: n.icon, group: "Go to", go: go(n.to) }));
    const found = results.map((r) => ({
      id: `${r.type}-${r.id}`, label: r.label, sublabel: r.sublabel, icon: TYPE_ICON[r.type], group: "Results", go: go(resultPath(r)),
    }));
    return [...found, ...pages];
  }, [q, results, can, navigate, onClose]);

  if (!open) return null;
  const groups = [...new Set(entries.map((e) => e.group))];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-navy/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Search and commands" className="w-full max-w-xl animate-fade-in overflow-hidden rounded-xl bg-white shadow-e3">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Icon name="search" className="h-5 w-5 text-slate-400" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, entries.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter") entries[active]?.go();
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search district, taluka, survey, plot code, date or lat, lon"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={entries[active] ? `palette-${entries[active].id}` : undefined}
          />
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-r-transparent" aria-label="Searching" />}
          <Kbd>Esc</Kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
          {groups.map((g) => (
            <li key={g} role="presentation">
              <p className="px-4 pb-1 pt-2 eyebrow">{g}</p>
              <ul role="presentation">
                {entries.filter((e) => e.group === g).map((e) => {
                  const i = entries.indexOf(e);
                  return (
                    <li key={e.id} id={`palette-${e.id}`} role="option" aria-selected={i === active}>
                      <button onMouseMove={() => setActive(i)} onClick={e.go}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === active ? "bg-navy-50" : ""}`}>
                        <Icon name={e.icon} className="h-4 w-4 text-slate-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{e.label}</span>
                          {e.sublabel && <span className="block truncate text-xs text-slate-500">{e.sublabel}</span>}
                        </span>
                        {i === active && <Icon name="chevronRight" className="h-4 w-4 text-slate-400" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {!entries.length && <li className="px-4 py-6 text-center text-sm text-slate-500">{q ? "No matches" : "Type to search"}</li>}
        </ul>
      </div>
    </div>
  );
}
