import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Skeleton } from "./ui/Skeleton";
import { Sparkline } from "./ui/Sparkline";

export function StatCard({ label, value, hint, icon, trend, trendLabel, loading }: {
  label: string; value: ReactNode; hint?: ReactNode; icon: IconName; trend?: (number | null)[]; trendLabel?: string; loading?: boolean;
}) {
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-navy-50 text-navy-600"><Icon name={icon} className="h-3.5 w-3.5" /></span>
        {label}
      </div>
      {loading ? (
        <><Skeleton className="h-7 w-24" /><Skeleton className="h-3 w-32" /></>
      ) : (
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-2xl font-semibold tracking-tight text-navy">{value}</div>
            {hint && <div className="mt-1 truncate text-xs text-slate-500">{hint}</div>}
          </div>
          {trend && <Sparkline values={trend} label={trendLabel ?? `${label} trend`} />}
        </div>
      )}
    </div>
  );
}
