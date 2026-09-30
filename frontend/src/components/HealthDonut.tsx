import { useState } from "react";
import type { DashboardSummary } from "../app/types";
import { HEALTH_COLORS, HEALTH_LABELS } from "../lib/colors";
import { fmtHa, fmtPct } from "../lib/format";

const R = 52;
const STROKE = 16;
const GAP_DEG = 1.5;

function arc(startDeg: number, endDeg: number): string {
  const xy = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [70 + R * Math.cos(a), 70 + R * Math.sin(a)];
  };
  const [x1, y1] = xy(startDeg);
  const [x2, y2] = xy(endDeg);
  return `M ${x1} ${y1} A ${R} ${R} 0 ${endDeg - startDeg > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/** Share of assessed plot area per health class; legend table carries every value. */
export function HealthDonut({ health }: { health: DashboardSummary["health"] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = health.reduce((s, h) => s + h.area_ha, 0);
  let cursor = 0;
  const segs = health.filter((h) => h.area_ha > 0).map((h) => {
    const sweep = (h.area_ha / total) * 360;
    const seg = { ...h, start: cursor, end: cursor + sweep };
    cursor += sweep;
    return seg;
  });
  const focus = health.find((h) => h.health_class === hover);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img" aria-label="Crop health share of assessed area">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#EEF2F7" strokeWidth={STROKE} />
        {segs.map((s) => (
          <path key={s.health_class} d={segs.length === 1 ? arc(0, 359.99) : arc(s.start + GAP_DEG / 2, s.end - GAP_DEG / 2)}
            fill="none" stroke={HEALTH_COLORS[s.health_class]} strokeWidth={hover === s.health_class ? STROKE + 4 : STROKE}
            tabIndex={0} onPointerEnter={() => setHover(s.health_class)} onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(s.health_class)} onBlur={() => setHover(null)}>
            <title>{`${HEALTH_LABELS[s.health_class]}: ${fmtHa(s.area_ha)} (${fmtPct(s.pct)})`}</title>
          </path>
        ))}
        <text x="70" y="68" textAnchor="middle" className="fill-navy text-[20px] font-semibold">{focus ? fmtPct(focus.pct, 0) : fmtHa(total, 1).replace(" ha", "")}</text>
        <text x="70" y="85" textAnchor="middle" className="fill-slate-500 text-[9px]">{focus ? HEALTH_LABELS[focus.health_class] : "ha assessed"}</text>
      </svg>
      <table className="min-w-[14rem] flex-1 text-sm">
        <thead><tr className="text-left text-2xs uppercase tracking-wider text-slate-500"><th className="pb-1 font-semibold">Class</th><th className="pb-1 text-right font-semibold">Share</th><th className="pb-1 text-right font-semibold">Area</th><th className="pb-1 text-right font-semibold">Plots</th></tr></thead>
        <tbody>
          {health.map((h) => (
            <tr key={h.health_class} className="border-t border-slate-100">
              <td className="py-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: HEALTH_COLORS[h.health_class] }} />{HEALTH_LABELS[h.health_class]}</td>
              <td className="num py-1.5 text-right font-medium">{fmtPct(h.pct)}</td>
              <td className="num py-1.5 text-right text-slate-600">{fmtHa(h.area_ha)}</td>
              <td className="num py-1.5 text-right text-slate-500">{h.plots}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
