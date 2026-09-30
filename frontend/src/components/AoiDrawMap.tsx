import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { MapConfig } from "../app/types";
import { setData } from "../lib/mapLayers";
import type { LngLat } from "../lib/measure";
import { MapView, fitBBox } from "./MapView";

/**
 * Click to add AOI vertices. The ring is shown live; the parent owns the
 * vertex list (so Undo / Clear / load-from-file stay simple).
 */
export function AoiDrawMap({
  config,
  vertices,
  onAdd,
  drawing,
  context,
  attribution = [],
}: {
  config: MapConfig;
  vertices: LngLat[];
  onAdd: (p: LngLat) => void;
  drawing: boolean;
  /** Admin boundary shown for orientation (e.g. the selected taluka). */
  context?: GeoJSON.Geometry | null;
  attribution?: string[];
}) {
  const mapRef = useRef<MlMap | null>(null);
  const addRef = useRef(onAdd);
  addRef.current = onAdd;
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const fittedFor = useRef<string>("");

  const render = (map: MlMap) => {
    const features: unknown[] = vertices.map((p, i) => ({
      type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { first: i === 0 },
    }));
    if (vertices.length >= 3) {
      features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...vertices, vertices[0]]] }, properties: {} });
    } else if (vertices.length === 2) {
      features.push({ type: "Feature", geometry: { type: "LineString", coordinates: vertices }, properties: {} });
    }
    setData(map, "aoi", { type: "FeatureCollection", features });
  };

  const showContext = (map: MlMap) => {
    setData(map, "context", context ? { type: "Feature", geometry: context, properties: {} } : { type: "FeatureCollection", features: [] });
    if (context && !vertices.length) {
      const coords = JSON.stringify(context).match(/-?\d+\.\d+,-?\d+\.\d+/g)?.map((p) => p.split(",").map(Number)) ?? [];
      if (coords.length) {
        const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1]);
        fitBBox(map, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 30, 14);
      }
    }
  };
  useEffect(() => { if (mapRef.current) showContext(mapRef.current); }, [context]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    render(map);
    // Fit when a whole polygon is loaded at once (demo field / file), not while clicking.
    const key = vertices.length > 3 ? JSON.stringify(vertices[0]) + vertices.length : "";
    if (!drawing && key && key !== fittedFor.current) {
      fittedFor.current = key;
      const xs = vertices.map((v) => v[0]);
      const ys = vertices.map((v) => v[1]);
      fitBBox(map, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 60, 18);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertices, drawing]);

  return (
    <MapView
      config={config}
      attribution={attribution}
      onReady={(map) => {
        mapRef.current = map;
        map.addSource("context", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "context-line", type: "line", source: "context", paint: { "line-color": "#3A5578", "line-width": 1.5, "line-opacity": 0.8 } });
        map.addSource("aoi", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "aoi-fill", type: "fill", source: "aoi", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2E7D32", "fill-opacity": 0.18 } });
        map.addLayer({ id: "aoi-line", type: "line", source: "aoi", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#2E7D32", "line-width": 2.5 } });
        map.addLayer({
          id: "aoi-points", type: "circle", source: "aoi", filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-radius": ["case", ["get", "first"], 6, 4], "circle-color": "#0B1F3A", "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
        });
        map.on("click", (e) => drawingRef.current && addRef.current([e.lngLat.lng, e.lngLat.lat]));
        map.doubleClickZoom.disable();
        map.getCanvas().style.cursor = "crosshair";
        render(map);
        showContext(map);
      }}
    />
  );
}
