import { useRef, type KeyboardEvent } from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

/** WAI-ARIA tabs (arrow keys move between tabs). */
export function Tabs({ tabs, value, onChange, label }: { tabs: TabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-slate-200">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => (refs.current[i] = el)}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "border-accent-600 text-navy" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t.label}
            {t.count != null && <span className="num rounded-full bg-slate-100 px-1.5 text-2xs text-slate-600">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
