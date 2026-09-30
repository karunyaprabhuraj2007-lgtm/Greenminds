import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { loadTokens } from "../app/api";
import type { BBox, MapConfig } from "../app/types";

function baseStyle(cfg: MapConfig): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    basemap: { type: "raster", tiles: [cfg.basemap.tiles_url], tileSize: 256, attribution: cfg.basemap.attribution, maxzoom: 19 },
  };
  const layers: StyleSpecification["layers"] = [
    { id: "background", type: "background", paint: { "background-color": "#eef1f4" } },
    { id: "basemap", type: "raster", source: "basemap", paint: { "raster-saturation": -0.35 } },
  ];
  if (cfg.satellite.tiles_url) {
    sources.satellite = { type: "raster", tiles: [cfg.satellite.tiles_url], tileSize: 256, attribution: cfg.satellite.attribution };
    layers.push({ id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } });
  }
  return { version: 8, sources, layers };
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
}

/** Creates a MapLibre map once; the parent adds sources/layers in `onReady`. */
export function MapView({ config, onReady, className = "", interactive = true }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(config),
      center: config.initial_view.center,
      zoom: config.initial_view.zoom,
      interactive,
      attributionControl: { compact: true },
      transformRequest,
    });
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 120 }), "bottom-right");
    }
    // "style.load" (not "load"): overlays only need the style, and "load" waits
    // for basemap tiles, which may be slow or unreachable in the field.
    map.once("style.load", () => readyRef.current(map));
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  return <div ref={container} className={`h-full w-full ${className}`} />;
}
