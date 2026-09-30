import type { MapConfig, SatelliteSeries } from "../../app/types";
import { CATEGORICAL, HEALTH_COLORS, HEALTH_LABELS, NDVI_GRADIENT, OTHER_GRAY } from "../../lib/colors";
import { fmtDate, titleCase } from "../../lib/format";
import { STATUS_GROUP_COLORS, type LayerState } from "../../lib/mapLayers";

function Swatch({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={line ? "h-0.5 w-4" : "h-2.5 w-2.5 rounded-sm"} style={{ background: color }} />
      {label}
    </li>
  );
}

export function Legend({ state, config, satellite, hasPlots }: { state: LayerState; config: MapConfig; satellite: SatelliteSeries | null; hasPlots: boolean }) {
  const ndviOn = state.ndvi.visible && !!satellite?.layer;
  const plotTheme = state.plots && hasPlots ? state.theme : "none";
  if (!ndviOn && plotTheme === "none" && !state.surveys) return null;
  const t = config.health_thresholds;
  return (
    <div className="floating w-72 space-y-3 px-3 py-2.5 text-2xs text-slate-700" role="region" aria-label="Legend">
      {(ndviOn || plotTheme === "ndvi") && (
        <div>
          <p className="mb-1 font-semibold text-slate-800">NDVI</p>
          <div className="h-2 rounded-sm" style={{ background: `linear-gradient(to right, ${NDVI_GRADIENT.join(",")})` }} />
          <div className="num mt-0.5 flex justify-between text-slate-500"><span>0.0</span><span>0.45</span><span>0.9</span></div>
          {ndviOn && satellite?.layer && <p className="mt-1 text-slate-500">Sentinel-2 L2A, {fmtDate(satellite.layer.acquired_at?.slice(0, 10))}, {satellite.layer.cloud_cover?.toFixed(0)}% cloud</p>}
        </div>
      )}
      {plotTheme === "health" && (
        <div>
          <p className="mb-1 font-semibold text-slate-800">Plot health (latest clear Sentinel-2)</p>
          <ul className="space-y-0.5">
            <Swatch color={HEALTH_COLORS.healthy} label={`${HEALTH_LABELS.healthy} · NDVI > ${t.ndvi_healthy_min}`} />
            <Swatch color={HEALTH_COLORS.moderate} label={`${HEALTH_LABELS.moderate} · ${t.ndvi_moderate_min}–${t.ndvi_healthy_min}`} />
            <Swatch color={HEALTH_COLORS.severe} label={`${HEALTH_LABELS.severe} · < ${t.ndvi_moderate_min}`} />
            <Swatch color="#94a3b8" label="No clear observation" />
          </ul>
          <p className="mt-1 text-slate-500">Indicative thresholds, not agronomically certified.</p>
        </div>
      )}
      {plotTheme === "crop" && (
        <ul className="space-y-0.5">
          {config.crops.slice(0, CATEGORICAL.length).map((c, i) => <Swatch key={c} color={CATEGORICAL[i]} label={titleCase(c)} />)}
          <Swatch color={OTHER_GRAY} label="Other" />
        </ul>
      )}
      {state.surveys && (
        <div>
          <p className="mb-1 font-semibold text-slate-800">Survey areas</p>
          <ul className="space-y-0.5">
            <Swatch line color={STATUS_GROUP_COLORS.planning} label="Draft / planned" />
            <Swatch line color={STATUS_GROUP_COLORS.in_progress} label="Flying / processing" />
            <Swatch line color={STATUS_GROUP_COLORS.done} label="Processed" />
          </ul>
        </div>
      )}
    </div>
  );
}
