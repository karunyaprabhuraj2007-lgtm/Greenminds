import { useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../app/nav";

const PHASE_DESCRIPTIONS: Record<number, string> = {
  2: "GIS map dashboard: layers, plot panel, dashboard cards, search and drill-down.",
  3: "Survey creation, AOI drawing and the flight planner with QGroundControl / Mission Planner export.",
  4: "Live telemetry (MAVLink / SITL / replay) and live video.",
  5: "Upload to storage and the processing pipeline (validate, geotag, calibrate, photogrammetry).",
  6: "Vegetation indices, plots, zonal statistics, health classes and crop classification.",
  7: "Offline-first field verification PWA and AI-vs-human review.",
  8: "Damage, insurance and subsidy verification modules and reports.",
};

/** Placeholder for pages delivered in later build phases. */
export function PhasePlaceholder() {
  const { pathname } = useLocation();
  const item = NAV_ITEMS.find((i) => i.to === pathname);
  const phase = item?.phase;
  return (
    <div className="card max-w-2xl p-6">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-leaf">
        {phase ? `Planned for build phase ${phase}` : "Planned"}
      </div>
      <h2 className="text-lg font-semibold text-navy">{item?.label ?? "Page"}</h2>
      <p className="mt-2 text-sm text-slate-600">
        {phase ? PHASE_DESCRIPTIONS[phase] : "This page is not built yet."}
      </p>
      <p className="mt-4 text-xs text-slate-500">
        Your role has access to this page. It becomes functional when its build phase is delivered.
      </p>
    </div>
  );
}
