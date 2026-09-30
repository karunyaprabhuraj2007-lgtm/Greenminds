import { cropColor } from "../lib/colors";
import { fmtHa, fmtPct, titleCase } from "../lib/format";
import type { DashboardSummary } from "../app/types";

/** Crop distribution (crop, ha, %). Swatch = the crop's map colour; bars are one series. */
export function CropTable({ rows, cropOrder }: { rows: DashboardSummary["crop_distribution"]; cropOrder: string[] }) {
  const max = Math.max(1, ...rows.map((r) => r.area_ha));
  if (!rows.length) return <p className="text-sm text-slate-500">No analysed plots yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="pb-2 font-semibold">Crop (AI)</th>
          <th className="pb-2 text-right font-semibold">Area</th>
          <th className="pb-2 text-right font-semibold">Share</th>
          <th className="w-1/3 pb-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.crop} className="border-t border-slate-100" title={`${titleCase(r.crop)}: ${r.plots} plots`}>
            <td className="py-1.5">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: cropColor(r.crop, cropOrder) }} />
              {titleCase(r.crop)}
            </td>
            <td className="py-1.5 text-right tabular-nums">{fmtHa(r.area_ha)}</td>
            <td className="py-1.5 text-right tabular-nums">{fmtPct(r.pct)}</td>
            <td className="py-1.5 pl-3">
              <div className="h-2 rounded-r bg-[#2a78d6]" style={{ width: `${(100 * r.area_ha) / max}%` }} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
