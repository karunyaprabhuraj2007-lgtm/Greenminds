import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { loadTokens } from "../app/api";
import type { BBox, MapConfig } from "../app/types";

export type Basemap = "light" | "dark";

function baseStyle(cfg: MapConfig, basemap: Basemap): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    "basemap-light": { type: "raster", tiles: [cfg.basemaps.light.tiles_url], tileSize: 256, attribution: cfg.basemaps.light.attribution, maxzoom: 19 },
    "basemap-dark": { type: "raster", tiles: [cfg.basemaps.dark.tiles_url], tileSize: 256, attribution: cfg.basemaps.dark.attribution, maxzoom: 19 },
  };
  const layers: StyleSpecification["layers"] = [
    { id: "background", type: "background", paint: { "background-color": basemap === "dark" ? "#0f1b2d" : "#eef1f4" } },
    { id: "basemap-light", type: "raster", source: "basemap-light", layout: { visibility: basemap === "light" ? "visible" : "none" }, paint: { "raster-saturation": -0.4 } },
    { id: "basemap-dark", type: "raster", source: "basemap-dark", layout: { visibility: basemap === "dark" ? "visible" : "none" } },
  ];
  if (cfg.satellite.tiles_url) {
    sources.satellite = { type: "raster", tiles: [cfg.satellite.tiles_url], tileSize: 256, attribution: cfg.satellite.attribution };
    layers.push({ id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } });
  }
  return { version: 8, sources, layers };
}

export function setBasemap(map: MlMap, basemap: Basemap) {
  map.setLayoutProperty("basemap-light", "visibility", basemap === "light" ? "visible" : "none");
  map.setLayoutProperty("basemap-dark", "visibility", basemap === "dark" ? "visible" : "none");
  map.setPaintProperty("background", "background-color", basemap === "dark" ? "#0f1b2d" : "#eef1f4");
}

/** Adds the bearer token to requests for our own API (tile endpoint). */
function transformRequest(url: string) {
  const own = url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
  const tokens = own ? loadTokens() : null;
  return tokens ? { url, headers: { Authorization: `Bearer ${tokens.access_token}` } } : { url };
}

type Padding = number | { top: number; bottom: number; left: number; right: number };

export function fitBBox(map: MlMap, bbox: BBox | null | undefined, padding: Padding = 40, maxZoom = 18) {
  if (!bbox) return;
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding, maxZoom, duration: 600 });
}

interface Props {
  config: MapConfig;
  onReady: (map: MlMap) => void;
  className?: string;
  interactive?: boolean;
  basemap?: Basemap;
  /** Extra attribution (data sources) shown in the map footer. */
  attribution?: string[];
  controls?: boolean;
}

/** Creates a MapLibre map once; the parent adds sources/layers in `onReady`. */
export function MapView({ config, onReady, className = "", interactive = true, basemap = "light", attribution = [], controls = true }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(config, basemap),
      center: config.initial_view.center,
      zoom: config.initial_view.zoom,
      interactive,
      attributionControl: { compact: true, customAttribution: attribution },
      transformRequest,
    });
    if (interactive && controls) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-right");
    }
    // "style.load" (not "load"): overlays only need the style; "load" waits for
    // basemap tiles, which may be slow or unreachable in the field.
    map.once("style.load", () => readyRef.current(map));
    // Start with the attribution collapsed to its (i) button; it expands on click.
    map.once("load", () => container.current?.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show"));
    setTimeout(() => container.current?.querySelector(".maplibregl-compact-show")?.classList.remove("maplibregl-compact-show"), 1500);
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  return <div ref={container} className={`h-full w-full ${className}`} />;
}
