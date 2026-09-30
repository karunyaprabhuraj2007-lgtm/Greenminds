import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { CATEGORICAL, HEALTH_COLORS, ORANGE_RAMP, OTHER_GRAY, RED_RAMP, rampStops } from "./colors";

export type PlotTheme = "none" | "crop" | "health" | "stress" | "damage";

export interface LayerToggle {
  visible: boolean;
  opacity: number;
}

export interface LayerState {
  ortho: LayerToggle;
  ndvi: LayerToggle;
  satellite: LayerToggle;
  plots: boolean;
  theme: PlotTheme;
  themeOpacity: number;
  labels: boolean;
  admin: boolean;
  status: boolean;
  history: boolean;
}

export const DEFAULT_LAYERS: LayerState = {
  ortho: { visible: true, opacity: 1 },
  ndvi: { visible: true, opacity: 0.85 },
  satellite: { visible: false, opacity: 1 },
  plots: true,
  theme: "health",
  themeOpacity: 0.55,
  labels: true,
  admin: true,
  status: true,
  history: false,
};

export const STATUS_GROUP_COLORS = { planning: CATEGORICAL[0], in_progress: CATEGORICAL[1], done: CATEGORICAL[2] };
export const STATUS_GROUP: Record<string, keyof typeof STATUS_GROUP_COLORS> = {
  draft: "planning", planned: "planning", flying: "in_progress", uploaded: "in_progress",
  processing: "in_progress", processed: "done", verified: "done", archived: "done",
};

const EMPTY = { type: "FeatureCollection", features: [] } as const;

/** Install all overlay sources/layers once, in drawing order (bottom -> top). */
export function installOverlays(map: MlMap) {
  for (const id of ["units", "history", "surveys", "plots", "measure"]) {
    map.addSource(id, { type: "geojson", data: EMPTY as never, promoteId: id === "plots" ? "id" : undefined });
  }
  map.addLayer({ id: "units-fill", type: "fill", source: "units", paint: { "fill-color": "#2a78d6", "fill-opacity": 0.12 } });
  map.addLayer({ id: "units-line", type: "line", source: "units", paint: { "line-color": "#0B1F3A", "line-width": 1.2, "line-opacity": 0.6 } });
  map.addLayer({
    id: "history-line", type: "line", source: "history",
    paint: { "line-color": "#6b7280", "line-width": 1.5, "line-dasharray": [2, 2] },
  });
  map.addLayer({ id: "surveys-fill", type: "fill", source: "surveys", paint: { "fill-color": "#ffffff", "fill-opacity": 0.01 } });
  map.addLayer({
    id: "surveys-line", type: "line", source: "surveys",
    paint: {
      "line-width": 2.5,
      "line-color": ["match", ["get", "status_group"],
        "planning", STATUS_GROUP_COLORS.planning, "in_progress", STATUS_GROUP_COLORS.in_progress, STATUS_GROUP_COLORS.done],
    },
  });
  map.addLayer({ id: "plots-fill", type: "fill", source: "plots", paint: { "fill-color": "transparent", "fill-opacity": 0.55 } });
  map.addLayer({ id: "plots-line", type: "line", source: "plots", paint: { "line-color": "#ffffff", "line-width": 1.5 } });
  map.addLayer({
    id: "plots-selected", type: "line", source: "plots",
    paint: { "line-color": "#0B1F3A", "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, 0] },
  });
  map.addLayer({ id: "measure-fill", type: "fill", source: "measure", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#0B1F3A", "fill-opacity": 0.1 } });
  map.addLayer({ id: "measure-line", type: "line", source: "measure", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#0B1F3A", "line-width": 2 } });
  map.addLayer({
    id: "measure-points", type: "circle", source: "measure", filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 4, "circle-color": "#0B1F3A", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
}

export function setData(map: MlMap, source: string, data: unknown) {
  (map.getSource(source) as GeoJSONSource | undefined)?.setData(data as never);
}

export function themeColor(theme: PlotTheme, crops: string[]): ExpressionSpecification | string {
  switch (theme) {
    case "crop": {
      const pairs = crops.slice(0, CATEGORICAL.length).flatMap((c, i) => [c, CATEGORICAL[i]]);
      return pairs.length
        ? (["match", ["coalesce", ["get", "crop_pred"], ""], ...pairs, OTHER_GRAY] as unknown as ExpressionSpecification)
        : OTHER_GRAY;
    }
    case "health":
      return ["match", ["coalesce", ["get", "health_class"], ""],
        "healthy", HEALTH_COLORS.healthy, "moderate", HEALTH_COLORS.moderate, "severe", HEALTH_COLORS.severe, OTHER_GRAY];
    case "stress":
      return ["interpolate", ["linear"], ["coalesce", ["get", "stress_pct"], 0], ...rampStops(ORANGE_RAMP, 0, 100)] as ExpressionSpecification;
    case "damage":
      return ["interpolate", ["linear"], ["coalesce", ["get", "damage_pct"], 0], ...rampStops(RED_RAMP, 0, 100)] as ExpressionSpecification;
    default:
      return "transparent";
  }
}

const vis = (on: boolean) => (on ? "visible" : "none");

function setVisible(map: MlMap, id: string, on: boolean) {
  if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(on));
}

export function applyLayerState(map: MlMap, s: LayerState, crops: string[]) {
  for (const key of ["ortho", "ndvi", "satellite"] as const) {
    setVisible(map, key, s[key].visible);
    if (map.getLayer(key)) map.setPaintProperty(key, "raster-opacity", s[key].opacity);
  }
  setVisible(map, "plots-line", s.plots);
  setVisible(map, "plots-fill", s.plots && s.theme !== "none");
  map.setPaintProperty("plots-fill", "fill-color", themeColor(s.theme, crops));
  map.setPaintProperty("plots-fill", "fill-opacity", s.themeOpacity);
  setVisible(map, "units-fill", s.admin);
  setVisible(map, "units-line", s.admin);
  setVisible(map, "surveys-line", s.status);
  setVisible(map, "history-line", s.history);
}

/** (Re)create a raster tile layer below the vector overlays. */
export function setRasterLayer(map: MlMap, id: "ortho" | "ndvi", tilesUrl: string | null, state: LayerToggle, bounds?: number[] | null) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
  if (!tilesUrl) return;
  map.addSource(id, {
    type: "raster",
    tiles: [tilesUrl.startsWith("/") ? `${window.location.origin}${tilesUrl}` : tilesUrl],
    tileSize: 256,
    maxzoom: 22,
    ...(bounds ? { bounds: bounds as [number, number, number, number] } : {}),
  });
  // NDVI sits above the orthomosaic; both below admin/plot overlays.
  const before = id === "ortho" && map.getLayer("ndvi") ? "ndvi" : "units-fill";
  map.addLayer(
    { id, type: "raster", source: id, layout: { visibility: vis(state.visible) }, paint: { "raster-opacity": state.opacity } },
    before,
  );
}

/** Rough label anchor for a polygon ring: vertex average (fine for field plots). */
export function ringCenter(ring: number[][]): [number, number] {
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
  const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [x, y];
}
