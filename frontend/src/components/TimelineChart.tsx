import type { TimelinePoint } from "../app/types";
import { fmtDate, fmtNum } from "../lib/format";

const W = 260;
const H = 70;
const PAD = { l: 26, r: 34, t: 8, b: 16 };

/** NDVI mean per dated survey (single series: the title names it, no legend). */
export function TimelineChart({ points, currentSurveyId }: { points: TimelinePoint[]; currentSurveyId?: string }) {
  const pts = points.filter((p) => p.ndvi_mean != null);
  if (pts.length === 0) return <p className="text-xs text-slate-500">No NDVI history yet.</p>;
  const xs = (i: number) => PAD.l + (pts.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (pts.length - 1));
  const ys = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b); // NDVI axis fixed 0..1
  const line = pts.map((p, i) => `${i ? "L" : "M"}${xs(i)},${ys(p.ndvi_mean!)}`).join(" ");
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="NDVI mean by survey date">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={ys(v)} y2={ys(v)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={PAD.l - 4} y={ys(v) + 3} textAnchor="end" className="fill-slate-400 text-[8px] tabular-nums">{v.toFixed(1)}</text>
        </g>
      ))}
      <path d={line} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={p.survey_id}>
          <circle cx={xs(i)} cy={ys(p.ndvi_mean!)} r={12} fill="transparent">
            <title>{`${fmtDate(p.survey_date)}: NDVI ${fmtNum(p.ndvi_mean)}${p.health_class ? ` (${p.health_class})` : ""}`}</title>
          </circle>
          <circle cx={xs(i)} cy={ys(p.ndvi_mean!)} r={p.survey_id === currentSurveyId ? 5 : 4}
            fill={p.survey_id === currentSurveyId ? "#0B1F3A" : "#2a78d6"} stroke="#fff" strokeWidth={2} pointerEvents="none" />
          <text x={xs(i)} y={H - 3} textAnchor="middle" className="fill-slate-500 text-[8px]">
            {p.survey_date ? new Date(`${p.survey_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "?"}
          </text>
        </g>
      ))}
      <text x={xs(pts.length - 1) + 8} y={ys(last.ndvi_mean!) + 3} className="fill-slate-700 text-[9px] font-semibold tabular-nums">
        {fmtNum(last.ndvi_mean)}
      </text>
    </svg>
  );
}
