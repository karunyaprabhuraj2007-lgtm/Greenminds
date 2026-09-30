import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from "recharts";
import type { NdviPoint } from "../../app/types";
import { fmtDate } from "../../lib/format";

const GREEN = "#2E7D32";
const AXIS = { stroke: "#94a3b8", fontSize: 11 };

const ts = (d: string) => new Date(`${d}T00:00:00`).getTime();
const tick = (v: number) => new Date(v).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

interface Row {
  t: number;
  date: string;
  mean: number | null;
  partial: number | null;
  band: [number, number] | null;
  clear: number;
  p: NdviPoint;
}

function TooltipBody({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-e2">
      <p className="font-semibold text-slate-900">{fmtDate(r.date)}</p>
      {r.p.ndvi_mean != null ? (
        <>
          <p className="num mt-1"><span className="text-lg font-semibold text-navy">{r.p.ndvi_mean.toFixed(3)}</span> <span className="text-slate-500">mean NDVI</span></p>
          <p className="num text-slate-600">p10–p90: {r.p.ndvi_p10?.toFixed(3)} – {r.p.ndvi_p90?.toFixed(3)}</p>
        </>
      ) : <p className="mt-1 text-slate-600">No cloud-free pixels</p>}
      <p className="num text-slate-600">Cloud-free: {(r.clear * 100).toFixed(0)}% of area · scene cloud {r.p.scene_cloud_pct?.toFixed(0) ?? "–"}%</p>
      <p className="mt-1 max-w-[16rem] truncate font-mono text-2xs text-slate-400">{r.p.scene_id}</p>
    </div>
  );
}

/** Sentinel-2 NDVI per acquisition date. Solid dots = clear dates; hollow = partly clouded. */
export function NdviChart({ series, minClear, height = 260 }: { series: NdviPoint[]; minClear: number; height?: number }) {
  const rows: Row[] = series.map((p) => {
    const clearEnough = p.ndvi_mean != null && p.clear_fraction >= minClear;
    return {
      t: ts(p.date), date: p.date, p,
      mean: clearEnough ? p.ndvi_mean : null,
      partial: !clearEnough && p.ndvi_mean != null ? p.ndvi_mean : null,
      band: clearEnough && p.ndvi_p10 != null && p.ndvi_p90 != null ? [p.ndvi_p10, p.ndvi_p90] : null,
      clear: p.clear_fraction,
    };
  });
  const clearRows = rows.filter((r) => r.mean != null);
  const domain: [number, number] = [rows[0]?.t ?? 0, rows[rows.length - 1]?.t ?? 1];
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={domain} tickFormatter={tick} {...AXIS} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} minTickGap={24} />
          <YAxis domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} {...AXIS} tickLine={false} axisLine={false} width={40} />
          <ReferenceLine y={0.6} stroke="#cbd5e1" strokeDasharray="0" label={{ value: "healthy > 0.6", position: "insideTopRight", fontSize: 10, fill: "#64748b" }} />
          <Tooltip content={<TooltipBody />} cursor={{ stroke: "#94a3b8", strokeWidth: 1 }} />
          <Area data={clearRows} dataKey="band" type="monotone" stroke="none" fill={GREEN} fillOpacity={0.12} isAnimationActive={false} connectNulls />
          <Line data={clearRows} dataKey="mean" type="monotone" stroke={GREEN} strokeWidth={2} dot={{ r: 4, fill: GREEN, stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 6 }} isAnimationActive={false} connectNulls />
          <Scatter dataKey="partial" fill="#fff" stroke={GREEN} strokeWidth={1.5} isAnimationActive={false} shape="circle" />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mb-1 mt-3 text-xs font-medium text-slate-600">Cloud-free share of the area per scene</p>
      <ResponsiveContainer width="100%" height={70}>
        <BarChart data={rows} margin={{ top: 0, right: 16, left: -8, bottom: 0 }}>
          <XAxis dataKey="t" type="number" scale="time" domain={domain} hide />
          <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => `${v * 100}%`} {...AXIS} tickLine={false} axisLine={false} width={40} />
          <ReferenceLine y={minClear} stroke="#94a3b8" />
          <Tooltip content={<TooltipBody />} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="clear" fill="#6da7ec" maxBarSize={6} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4 text-2xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} />Mean NDVI (≥ {Math.round(minClear * 100)}% cloud-free)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: GREEN }} />Partly cloudy date</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: GREEN, opacity: 0.2 }} />p10–p90 range</span>
      </div>
    </div>
  );
}
