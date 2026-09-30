import type { ReactNode } from "react";
import type { MapConfig, SatelliteSeries } from "../../app/types";
import { fmtDate } from "../../lib/format";
import type { LayerState, LayerToggle, PlotTheme } from "../../lib/mapLayers";
import { Icon } from "../Icon";
import { IconButton } from "../ui/Button";

function Toggle({ label, checked, disabled, onChange, meta, children }: {
  label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; meta?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className={`py-2 ${disabled ? "opacity-50" : ""}`}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-[#0B1F3A]" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800">{label}</span>
          {meta && <span className="block text-2xs leading-4 text-slate-500">{meta}</span>}
        </span>
      </label>
      {children && <div className="ml-6 mt-2">{children}</div>}
    </div>
  );
}

function Opacity({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-2xs text-slate-500">
      Opacity
      <input type="range" min={0} max={1} step={0.05} value={value} aria-label={`${label} opacity`} onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer accent-[#0B1F3A]" />
      <span className="num w-8 text-right">{Math.round(value * 100)}%</span>
    </label>
  );
}

const THEMES: { value: PlotTheme; label: string }[] = [
  { value: "health", label: "Health (Sentinel-2)" },
  { value: "ndvi", label: "NDVI value" },
  { value: "none", label: "Outline only" },
];

export function LayerControl({ state, onChange, config, satellite, hasSurvey, hasCrops, onClose }: {
  state: LayerState; onChange: (s: LayerState) => void; config: MapConfig; satellite: SatelliteSeries | null;
  hasSurvey: boolean; hasCrops: boolean; onClose: () => void;
}) {
  const set = (p: Partial<LayerState>) => onChange({ ...state, ...p });
  const setT = (k: "ndvi" | "satellite", p: Partial<LayerToggle>) => set({ [k]: { ...state[k], ...p } });
  const layer = satellite?.layer;
  const themes = hasCrops ? [...THEMES.slice(0, 2), { value: "crop" as PlotTheme, label: "Crop type (AI)" }, THEMES[2]] : THEMES;
  const boundary = config.boundaries.datasets.find((d) => d.key.endsWith("adm3")) ?? config.boundaries.datasets[0];
  return (
    <div className="floating flex max-h-full w-72 min-h-0 flex-col" role="region" aria-label="Layers">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-navy"><Icon name="layers" className="h-4 w-4" />Layers</span>
        <IconButton icon="close" label="Hide layers (L)" onClick={onClose} />
      </div>
      <div className="overflow-y-auto px-4 py-2">
        <p className="eyebrow pt-1">Imagery</p>
        <Toggle label="Sentinel-2 NDVI" checked={state.ndvi.visible} disabled={!layer?.tiles_url} onChange={(v) => setT("ndvi", { visible: v })}
          meta={layer ? `Sentinel-2 L2A · ${fmtDate(layer.acquired_at?.slice(0, 10))} · ${layer.cloud_cover?.toFixed(0) ?? "–"}% cloud · ${config.satellite_source.licence}`
            : hasSurvey ? "No clear scene yet — refresh Sentinel-2 on the survey" : "Select a survey"}>
          {layer?.tiles_url && state.ndvi.visible && <Opacity label="NDVI" value={state.ndvi.opacity} onChange={(v) => setT("ndvi", { opacity: v })} />}
        </Toggle>
        {config.satellite.tiles_url && (
          <Toggle label="Satellite basemap" checked={state.satellite.visible} onChange={(v) => setT("satellite", { visible: v })} meta={config.satellite.attribution} />
        )}
        <p className="eyebrow pt-3">Plots</p>
        <Toggle label="Plot boundaries" checked={state.plots} disabled={!hasSurvey} onChange={(v) => set({ plots: v })} meta="Drawn or imported by officers">
          {state.plots && hasSurvey && (
            <div className="space-y-1.5">
              {themes.map((t) => (
                <label key={t.value} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                  <input type="radio" name="plot-theme" className="accent-[#0B1F3A]" checked={state.theme === t.value} onChange={() => set({ theme: t.value })} />
                  {t.label}
                </label>
              ))}
              {state.theme !== "none" && <Opacity label="Plot fill" value={state.themeOpacity} onChange={(v) => set({ themeOpacity: v })} />}
            </div>
          )}
        </Toggle>
        <Toggle label="Plot labels" checked={state.labels} disabled={!hasSurvey} onChange={(v) => set({ labels: v })} />
        <p className="eyebrow pt-3">Context</p>
        <Toggle label="Admin boundaries" checked={state.boundaries} onChange={(v) => set({ boundaries: v })}
          meta={boundary ? `${boundary.provider} · ${boundary.version?.split(" (")[0]} · ${boundary.licence.replace("Open Data Commons Open Database License 1.0", "ODbL 1.0")}` : undefined} />
        <Toggle label="Survey areas" checked={state.surveys} onChange={(v) => set({ surveys: v })} meta="Coloured by survey status" />
        <Toggle label="Earlier surveys" checked={state.history} onChange={(v) => set({ history: v })} meta="Older dated surveys of the same area" />
      </div>
    </div>
  );
}
