import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeatherDay } from "../../app/types";
import { fmtDate } from "../../lib/format";

const AXIS = { stroke: "#94a3b8", fontSize: 11 };
const RAIN = "#2a78d6";
const TMAX = "#eb6834";
const TMIN = "#2a78d6";
const tick = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Tip({ active, payload }: { active?: boolean; payload?: { payload: WeatherDay }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-e2">
      <p className="font-semibold text-slate-900">{fmtDate(d.day)} {d.source === "forecast" && <span className="font-normal text-slate-500">· forecast</span>}</p>
      <p className="num mt-1">Rain <b>{d.precip_mm?.toFixed(1) ?? "–"} mm</b></p>
      <p className="num">Max <b>{d.tmax_c?.toFixed(1) ?? "–"} °C</b> · Min <b>{d.tmin_c?.toFixed(1) ?? "–"} °C</b></p>
    </div>
  );
}

/** Two charts (one axis each): daily rainfall and daily max/min temperature. */
export function WeatherCharts({ days }: { days: WeatherDay[] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-600">Daily rainfall (mm)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={days} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="day" tickFormatter={tick} {...AXIS} tickLine={false} minTickGap={28} />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={40} />
            <ReferenceLine x={today} stroke="#94a3b8" label={{ value: "today", position: "insideTopLeft", fontSize: 10, fill: "#64748b" }} />
            <Tooltip content={<Tip />} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="precip_mm" fill={RAIN} maxBarSize={8} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-4 text-xs font-medium text-slate-600">
          Daily temperature (°C)
          <span className="flex items-center gap-1.5 font-normal"><span className="h-0.5 w-4" style={{ background: TMAX }} />Max</span>
          <span className="flex items-center gap-1.5 font-normal"><span className="h-0.5 w-4" style={{ background: TMIN }} />Min</span>
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={days} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="day" tickFormatter={tick} {...AXIS} tickLine={false} minTickGap={28} />
            <YAxis {...AXIS} tickLine={false} axisLine={false} width={40} domain={["dataMin - 2", "dataMax + 2"]} tickFormatter={(v) => Math.round(v).toString()} />
            <ReferenceLine x={today} stroke="#94a3b8" />
            <Tooltip content={<Tip />} cursor={{ stroke: "#94a3b8", strokeWidth: 1 }} />
            <Line dataKey="tmax_c" stroke={TMAX} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="tmin_c" stroke={TMIN} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
