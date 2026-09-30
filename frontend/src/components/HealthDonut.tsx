import { useState } from "react";
import { HEALTH_COLORS, HEALTH_LABELS } from "../lib/colors";
import { fmtHa, fmtPct } from "../lib/format";
import type { DashboardSummary } from "../app/types";

const R = 54;
const STROKE = 18;
const GAP_DEG = 1.2; // ~2px surface gap between segments

function arc(startDeg: number, endDeg: number): string {
  const toXY = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [70 + R * Math.cos(a), 70 + R * Math.sin(a)];
  };
  const [x1, y1] = toXY(startDeg);
  const [x2, y2] = toXY(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
}

/** Part-to-whole of analysed area by health class (3 status segments, legend with values). */
export function HealthDonut({ health }: { health: DashboardSummary["health"] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = health.reduce((s, h) => s + h.area_ha, 0);
  let cursor = 0;
  const segments = health
    .filter((h) => h.area_ha > 0)
    .map((h) => {
      const sweep = (h.area_ha / total) * 360;
      const seg = { ...h, start: cursor, end: cursor + sweep };
      cursor += sweep;
      return seg;
    });
  const focus = health.find((h) => h.health_class === hover);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label="Health class share of analysed area">
        {total === 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="#e2e8f0" strokeWidth={STROKE} />}
        {segments.map((s) => (
          <path
            key={s.health_class}
            d={segments.length === 1 ? arc(0, 359.99) : arc(s.start + GAP_DEG / 2, s.end - GAP_DEG / 2)}
            fill="none"
            stroke={HEALTH_COLORS[s.health_class]}
            strokeWidth={hover === s.health_class ? STROKE + 4 : STROKE}
            onPointerEnter={() => setHover(s.health_class)}
            onPointerLeave={() => setHover(null)}
            tabIndex={0}
            onFocus={() => setHover(s.health_class)}
            onBlur={() => setHover(null)}
          >
            <title>{`${HEALTH_LABELS[s.health_class]}: ${fmtHa(s.area_ha)} (${fmtPct(s.pct)})`}</title>
          </path>
        ))}
        <text x="70" y="66" textAnchor="middle" className="fill-navy text-[18px] font-semibold">
          {focus ? fmtPct(focus.pct, 0) : fmtHa(total, 1).replace(" ha", "")}
        </text>
        <text x="70" y="84" textAnchor="middle" className="fill-slate-500 text-[9px]">
          {focus ? HEALTH_LABELS[focus.health_class] : "ha analysed"}
        </text>
      </svg>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1 font-semibold">Class</th>
            <th className="pb-1 text-right font-semibold">Share</th>
            <th className="pb-1 text-right font-semibold">Area</th>
            <th className="pb-1 text-right font-semibold">Plots</th>
          </tr>
        </thead>
        <tbody>
          {health.map((h) => (
            <tr key={h.health_class} className="border-t border-slate-100">
              <td className="py-1.5">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: HEALTH_COLORS[h.health_class] }} aria-hidden />
                {HEALTH_LABELS[h.health_class]}
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums text-slate-800">{fmtPct(h.pct)}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">{fmtHa(h.area_ha)}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-400">{h.plots}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
