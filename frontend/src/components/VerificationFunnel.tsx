import type { DashboardSummary } from "../app/types";

// Ordinal ramp (blue 300 -> 600), lightest step clears 2:1 on white.
const STEPS = ["#6da7ec", "#256abf", "#184f95"];

/** AI-only vs human-verified funnel. */
export function VerificationFunnel({ stages }: { stages: DashboardSummary["verification_funnel"] }) {
  const max = Math.max(1, stages[0]?.plots ?? 0);
  return (
    <div className="space-y-3">
      {stages.map((s, i) => (
        <div key={s.stage} title={`${s.label}: ${s.plots} plots`}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-600">{s.label}</span>
            <span className="font-medium tabular-nums text-slate-800">{s.plots}</span>
          </div>
          <div className="h-3 w-full rounded bg-slate-100">
            <div className="h-3 rounded-r" style={{ width: `${(100 * s.plots) / max}%`, background: STEPS[i] ?? STEPS[2] }} />
          </div>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-slate-500">
        AI results are decision support. Final decisions are made by authorized officers.
      </p>
    </div>
  );
}
