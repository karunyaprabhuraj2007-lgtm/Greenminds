import type { RasterInfo } from "../app/types";
import {
  CATEGORICAL, GREENS_GRADIENT, HEALTH_COLORS, HEALTH_LABELS, ORANGE_RAMP, OTHER_GRAY, RED_RAMP,
} from "../lib/colors";
import { titleCase } from "../lib/format";
import { STATUS_GROUP_COLORS, type LayerState, type LayerToggle, type PlotTheme } from "../lib/mapLayers";
import { DemoBadge } from "./DemoBadge";

interface Props {
  state: LayerState;
  onChange: (s: LayerState) => void;
  rasters: RasterInfo[];
  crops: string[];
  hasSatellite: boolean;
  hasSurvey: boolean;
}

function Row({ label, checked, disabled, onToggle, note, children }: {
  label: string; checked: boolean; disabled?: boolean; onToggle: (v: boolean) => void; note?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className={`py-1.5 ${disabled ? "opacity-50" : ""}`}>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="accent-[#0B1F3A]" checked={checked && !disabled} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
        <span className="flex-1">{label}</span>
        {note}
      </label>
      {children}
    </div>
  );
}

function Opacity({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      type="range" min={0} max={1} step={0.05} value={value} aria-label={`${label} opacity`}
      onChange={(e) => onChange(Number(e.target.value))}
      className="ml-6 mt-1 h-1 w-[calc(100%-1.5rem)] cursor-pointer accent-[#0B1F3A]"
    />
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </li>
  );
}

function Gradient({ colors, left, right }: { colors: string[]; left: string; right: string }) {
  return (
    <div>
      <div className="h-2 rounded-sm" style={{ background: `linear-gradient(to right, ${colors.join(",")})` }} />
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-500"><span>{left}</span><span>{right}</span></div>
    </div>
  );
}

const THEMES: { value: PlotTheme; label: string }[] = [
  { value: "none", label: "Boundaries only" },
  { value: "crop", label: "Crop type" },
  { value: "health", label: "Health class" },
  { value: "stress", label: "Crop stress" },
  { value: "damage", label: "Damage" },
];

export function LayerPanel({ state, onChange, rasters, crops, hasSatellite, hasSurvey }: Props) {
  const ortho = rasters.find((r) => r.kind === "orthomosaic");
  const ndvi = rasters.find((r) => r.kind === "ndvi");
  const set = (patch: Partial<LayerState>) => onChange({ ...state, ...patch });
  const setToggle = (key: "ortho" | "ndvi" | "satellite", patch: Partial<LayerToggle>) => set({ [key]: { ...state[key], ...patch } });

  return (
    <div className="space-y-3 text-sm">
      <section>
        <h3 className="label">Imagery</h3>
        <Row label="Orthomosaic" checked={state.ortho.visible} disabled={!ortho?.tiles_url}
          onToggle={(v) => setToggle("ortho", { visible: v })}
          note={!ortho ? <span className="text-[10px] text-slate-400">none yet</span> : ortho.is_demo ? <DemoBadge label="Sample" /> : undefined}>
          {ortho?.tiles_url && state.ortho.visible && <Opacity label="Orthomosaic" value={state.ortho.opacity} onChange={(v) => setToggle("ortho", { opacity: v })} />}
        </Row>
        <Row label="NDVI" checked={state.ndvi.visible} disabled={!ndvi?.tiles_url}
          onToggle={(v) => setToggle("ndvi", { visible: v })}
          note={ndvi?.is_demo ? <DemoBadge label="Demo" /> : undefined}>
          {ndvi?.tiles_url && state.ndvi.visible && (
            <>
              <Opacity label="NDVI" value={state.ndvi.opacity} onChange={(v) => setToggle("ndvi", { opacity: v })} />
              <div className="ml-6 mt-2">
                <Gradient colors={GREENS_GRADIENT} left={String(ndvi.rescale?.[0] ?? 0)} right={String(ndvi.rescale?.[1] ?? 1)} />
                <p className="mt-1 text-[10px] text-slate-500">{ndvi.legend}</p>
                {!ndvi.calibrated && (
                  <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    UNCALIBRATED — not comparable across dates
                  </p>
                )}
              </div>
            </>
          )}
        </Row>
        <Row label="Satellite context" checked={state.satellite.visible} disabled={!hasSatellite}
          onToggle={(v) => setToggle("satellite", { visible: v })}
          note={!hasSatellite ? <span className="text-[10px] text-slate-400">not configured</span> : undefined} />
      </section>

      <section>
        <h3 className="label">Plots</h3>
        <Row label="Plot boundaries" checked={state.plots} disabled={!hasSurvey} onToggle={(v) => set({ plots: v })} />
        <Row label="Plot ID labels" checked={state.labels} disabled={!hasSurvey} onToggle={(v) => set({ labels: v })} />
        <div className="ml-6 mt-1 space-y-1">
          {THEMES.map((t) => (
            <label key={t.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="theme" className="accent-[#0B1F3A]" checked={state.theme === t.value} onChange={() => set({ theme: t.value })} disabled={!hasSurvey} />
              {t.label}
            </label>
          ))}
          {state.theme !== "none" && <Opacity label="Plot colour" value={state.themeOpacity} onChange={(v) => set({ themeOpacity: v })} />}
          <div className="pt-1 text-[11px] text-slate-600">
            {state.theme === "crop" && (
              <ul className="space-y-0.5">
                {crops.slice(0, CATEGORICAL.length).map((c, i) => <Swatch key={c} color={CATEGORICAL[i]} label={titleCase(c)} />)}
                <Swatch color={OTHER_GRAY} label="Other / unclassified" />
              </ul>
            )}
            {state.theme === "health" && (
              <ul className="space-y-0.5">
                {Object.entries(HEALTH_LABELS).map(([k, v]) => <Swatch key={k} color={HEALTH_COLORS[k]} label={v} />)}
              </ul>
            )}
            {state.theme === "stress" && <Gradient colors={ORANGE_RAMP} left="0% stressed" right="100%" />}
            {state.theme === "damage" && <Gradient colors={RED_RAMP} left="0% damaged" right="100%" />}
          </div>
        </div>
      </section>

      <section>
        <h3 className="label">Context</h3>
        <Row label="Admin boundaries" checked={state.admin} onToggle={(v) => set({ admin: v })} />
        <Row label="Survey status" checked={state.status} onToggle={(v) => set({ status: v })}>
          {state.status && (
            <ul className="ml-6 mt-1 space-y-0.5 text-[11px] text-slate-600">
              <Swatch color={STATUS_GROUP_COLORS.planning} label="Planning" />
              <Swatch color={STATUS_GROUP_COLORS.in_progress} label="Flying / processing" />
              <Swatch color={STATUS_GROUP_COLORS.done} label="Processed" />
            </ul>
          )}
        </Row>
        <Row label="Historical surveys" checked={state.history} onToggle={(v) => set({ history: v })} />
      </section>
    </div>
  );
}
