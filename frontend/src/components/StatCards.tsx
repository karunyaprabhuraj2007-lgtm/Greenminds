import { DemoBadge } from "./DemoBadge";

export interface StatItem {
  label: string;
  value: string;
  hint?: string;
}

/** KPI row. Every tile carries a Demo badge when its numbers include seeded data. */
export function StatCards({ items, demo }: { items: StatItem[]; demo: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="card flex flex-col gap-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">{it.label}</span>
            {demo && <DemoBadge label="Demo" />}
          </div>
          <span className="text-2xl font-semibold text-navy">{it.value}</span>
          {it.hint && <span className="text-[11px] text-slate-400">{it.hint}</span>}
        </div>
      ))}
    </div>
  );
}
