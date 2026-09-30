import type { DashboardSummary } from "../app/types";

// Ordinal blue ramp: the lightest step still clears 2:1 on white.
const STEPS = ["#6da7ec", "#256abf", "#184f95"];

export function VerificationFunnel({ stages }: { stages: DashboardSummary["verification_funnel"] }) {
  const max = Math.max(1, stages[0]?.plots ?? 0);
  return (
    <div className="space-y-4">
      {stages.map((s, i) => (
        <div key={s.stage} title={`${s.label}: ${s.plots} plots`}>
          <div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-600">{s.label}</span><span className="num font-semibold text-slate-900">{s.plots}</span></div>
          <div className="h-2.5 w-full rounded-full bg-slate-100"><div className="h-2.5 rounded-full" style={{ width: `${(100 * s.plots) / max}%`, background: STEPS[i] ?? STEPS[2] }} /></div>
        </div>
      ))}
    </div>
  );
}
