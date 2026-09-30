import { useEffect, useRef, useState } from "react";
import { get } from "../app/api";
import type { SearchResult } from "../app/types";
import { DemoBadge } from "./DemoBadge";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  district: "District", taluka: "Taluka", village: "Village", survey: "Survey", plot: "Plot", crop: "Crop", coordinate: "Point",
};

export function SearchBar({ onSelect }: { onSelect: (r: SearchResult) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      get<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => {
          setResults(r.results);
          setActive(0);
          setOpen(true);
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (r: SearchResult) => {
    onSelect(r);
    setOpen(false);
    setQ(r.label);
  };

  return (
    <div ref={box} className="relative w-full max-w-md">
      <input
        className="input pr-8 shadow-sm"
        placeholder="Search village, plot code, survey, crop, date, or lat, lon"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && results[active]) choose(results[active]);
          else if (e.key === "Escape") setOpen(false);
        }}
        aria-label="Search the map"
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matches</li>}
          {results.map((r, i) => (
            <li key={`${r.type}-${r.id}`} role="option" aria-selected={i === active}>
              <button
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? "bg-slate-100" : "hover:bg-slate-50"}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(r)}
              >
                <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{TYPE_LABEL[r.type]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{r.label}</span>
                  <span className="block truncate text-xs text-slate-500">{r.sublabel}</span>
                </span>
                {r.is_demo && <DemoBadge label="Demo" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
