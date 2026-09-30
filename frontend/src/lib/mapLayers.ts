import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { CATEGORICAL, HEALTH_COLORS, NDVI_GRADIENT, OTHER_GRAY, rampStops } from "./colors";

export type PlotTheme = "health" | "ndvi" | "crop" | "none";

export interface LayerToggle {
  visible: boolean;
  opacity: number;
}

export interface LayerState {
  ndvi: LayerToggle;
  satellite: LayerToggle;
  boundaries: boolean;
  surveys: boolean;
  history: boolean;
  plots: boolean;
  theme: PlotTheme;
  themeOpacity: number;
  labels: boolean;
}

export const DEFAULT_LAYERS: LayerState = {
  ndvi: { visible: true, opacity: 0.85 },
  satellite: { visible: false, opacity: 1 },
  boundaries: true,
  surveys: true,
  history: false,
  plots: true,
  theme: "health",
  themeOpacity: 0.45,
  labels: true,
};

export const STATUS_GROUP_COLORS = { planning: CATEGORICAL[0], in_progress: CATEGORICAL[1], done: CATEGORICAL[2] };
export const STATUS_GROUP: Record<string, keyof typeof STATUS_GROUP_COLORS> = {
  draft: "planning", planned: "planning", flying: "in_progress", uploaded: "in_progress",
  processing: "in_progress", processed: "done", verified: "done", archived: "done",
};

const EMPTY = { type: "FeatureCollection", features: [] } as const;
const SOURCES = ["units", "history", "surveys", "plots", "draw", "measure"];

/** Install all overlay sources/layers once, in drawing order (bottom -> top). */
export function installOverlays(map: MlMap) {
  for (const id of SOURCES) {
    map.addSource(id, { type: "geojson", data: EMPTY as never, promoteId: id === "plots" || id === "units" ? "id" : undefined });
  }
  map.addLayer({ id: "units-fill", type: "fill", source: "units", paint: { "fill-color": "#0B1F3A", "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.08, 0.02] } });
  map.addLayer({ id: "units-line", type: "line", source: "units", paint: { "line-color": "#3A5578", "line-width": 1.25, "line-opacity": 0.9 } });
  map.addLayer({ id: "history-line", type: "line", source: "history", paint: { "line-color": "#64748b", "line-width": 1.5, "line-dasharray": [2, 2] } });
  map.addLayer({ id: "surveys-fill", type: "fill", source: "surveys", paint: { "fill-color": "#ffffff", "fill-opacity": 0.01 } });
  map.addLayer({
    id: "surveys-line", type: "line", source: "surveys",
    paint: {
      "line-width": ["case", ["boolean", ["get", "selected"], false], 3, 2],
      "line-color": ["match", ["get", "status_group"], "planning", STATUS_GROUP_COLORS.planning, "in_progress", STATUS_GROUP_COLORS.in_progress, STATUS_GROUP_COLORS.done],
    },
  });
  map.addLayer({ id: "plots-fill", type: "fill", source: "plots", paint: { "fill-color": "transparent", "fill-opacity": 0.45 } });
  map.addLayer({ id: "plots-line", type: "line", source: "plots", paint: { "line-color": "#ffffff", "line-width": 1.5 } });
  map.addLayer({
    id: "plots-highlight", type: "line", source: "plots",
    paint: {
      "line-color": "#0B1F3A",
      "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, ["boolean", ["feature-state", "hover"], false], 2, 0],
    },
  });
  map.addLayer({ id: "draw-fill", type: "fill", source: "draw", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2E7D32", "fill-opacity": 0.2 } });
  map.addLayer({ id: "draw-line", type: "line", source: "draw", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#2E7D32", "line-width": 2.5 } });
  map.addLayer({ id: "draw-points", type: "circle", source: "draw", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4.5, "circle-color": "#2E7D32", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  map.addLayer({ id: "measure-fill", type: "fill", source: "measure", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#0B1F3A", "fill-opacity": 0.1 } });
  map.addLayer({ id: "measure-line", type: "line", source: "measure", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#0B1F3A", "line-width": 2 } });
  map.addLayer({ id: "measure-points", type: "circle", source: "measure", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": "#0B1F3A", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
}

export function setData(map: MlMap, source: string, data: unknown) {
  (map.getSource(source) as GeoJSONSource | undefined)?.setData(data as never);
}

export function themeColor(theme: PlotTheme, crops: string[]): ExpressionSpecification | string {
  switch (theme) {
    case "health":
      return ["match", ["coalesce", ["get", "sat_health"], ""],
        "healthy", HEALTH_COLORS.healthy, "moderate", HEALTH_COLORS.moderate, "severe", HEALTH_COLORS.severe, "#94a3b8"];
    case "ndvi":
      return ["case", ["==", ["get", "sat_ndvi"], null], "#94a3b8",
        ["interpolate", ["linear"], ["get", "sat_ndvi"], ...rampStops(NDVI_GRADIENT, 0, 0.9)]] as unknown as ExpressionSpecification;
    case "crop": {
      const pairs = crops.slice(0, CATEGORICAL.length).flatMap((c, i) => [c, CATEGORICAL[i]]);
      return pairs.length ? (["match", ["coalesce", ["get", "crop_pred"], ""], ...pairs, OTHER_GRAY] as unknown as ExpressionSpecification) : OTHER_GRAY;
    }
    default:
      return "transparent";
  }
}

const vis = (on: boolean) => (on ? "visible" : "none");

function setVisible(map: MlMap, id: string, on: boolean) {
  if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis(on));
}

export function applyLayerState(map: MlMap, s: LayerState, crops: string[]) {
  for (const key of ["ndvi", "satellite"] as const) {
    setVisible(map, key, s[key].visible);
    if (map.getLayer(key)) map.setPaintProperty(key, "raster-opacity", s[key].opacity);
  }
  setVisible(map, "plots-line", s.plots);
  setVisible(map, "plots-highlight", s.plots);
  setVisible(map, "plots-fill", s.plots && s.theme !== "none");
  map.setPaintProperty("plots-fill", "fill-color", themeColor(s.theme, crops));
  map.setPaintProperty("plots-fill", "fill-opacity", s.themeOpacity);
  setVisible(map, "units-fill", s.boundaries);
  setVisible(map, "units-line", s.boundaries);
  setVisible(map, "surveys-line", s.surveys);
  setVisible(map, "history-line", s.history);
}

/** (Re)create a raster tile layer below the vector overlays. */
export function setRasterLayer(map: MlMap, id: "ndvi", tilesUrl: string | null, state: LayerToggle, bounds?: number[] | null, attribution?: string) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
  if (!tilesUrl) return;
  map.addSource(id, {
    type: "raster",
    tiles: [tilesUrl.startsWith("/") ? `${window.location.origin}${tilesUrl}` : tilesUrl],
    tileSize: 256,
    maxzoom: 22,
    attribution,
    ...(bounds ? { bounds: bounds as [number, number, number, number] } : {}),
  });
  map.addLayer({ id, type: "raster", source: id, layout: { visibility: vis(state.visible) }, paint: { "raster-opacity": state.opacity } }, "units-fill");
}

/** Label anchor for a polygon ring: vertex average (fine for field plots). */
export function ringCenter(ring: number[][]): [number, number] {
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

/** Draw/measure preview geometry for a vertex list. */
export function sketchFeatures(points: [number, number][], closed: boolean): unknown {
  const features: unknown[] = points.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: {} }));
  if (points.length >= 2) {
    features.push(closed && points.length >= 3
      ? { type: "Feature", geometry: { type: "Polygon", coordinates: [[...points, points[0]]] }, properties: {} }
      : { type: "Feature", geometry: { type: "LineString", coordinates: points }, properties: {} });
  }
  return { type: "FeatureCollection", features };
}
