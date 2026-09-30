import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { FeatureCollection, MapConfig, PlotProps, Survey } from "../app/types";
import { HEALTH_COLORS } from "../lib/colors";
import { setData } from "../lib/mapLayers";
import { MapView, fitBBox } from "./MapView";

/** Read-only survey map: AOI outline, plots coloured by Sentinel-2 health, optional NDVI tiles. */
export function SurveyMiniMap({ config, survey, plots, ndviTiles, attribution }: {
  config: MapConfig; survey: Survey; plots: FeatureCollection<GeoJSON.Polygon, PlotProps> | null; ndviTiles?: string | null; attribution: string[];
}) {
  const mapRef = useRef<MlMap | null>(null);
  const update = (map: MlMap) => {
    setData(map, "aoi", survey.aoi ? { type: "Feature", geometry: survey.aoi, properties: {} } : { type: "FeatureCollection", features: [] });
    setData(map, "plots", plots ?? { type: "FeatureCollection", features: [] });
    if (map.getLayer("ndvi")) map.removeLayer("ndvi");
    if (map.getSource("ndvi")) map.removeSource("ndvi");
    if (ndviTiles) {
      map.addSource("ndvi", { type: "raster", tiles: [`${window.location.origin}${ndviTiles}`], tileSize: 256, bounds: survey.bbox ?? undefined });
      map.addLayer({ id: "ndvi", type: "raster", source: "ndvi", paint: { "raster-opacity": 0.85 } }, "aoi-line");
    }
    fitBBox(map, survey.bbox, 32, 17);
  };
  useEffect(() => { if (mapRef.current) update(mapRef.current); }, [survey, plots, ndviTiles]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <MapView config={config} attribution={attribution} onReady={(map) => {
      mapRef.current = map;
      map.addSource("aoi", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("plots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "aoi-line", type: "line", source: "aoi", paint: { "line-color": "#0B1F3A", "line-width": 2 } });
      map.addLayer({
        id: "plots-fill", type: "fill", source: "plots",
        paint: { "fill-color": ["match", ["coalesce", ["get", "sat_health"], ""], "healthy", HEALTH_COLORS.healthy, "moderate", HEALTH_COLORS.moderate, "severe", HEALTH_COLORS.severe, "#94a3b8"], "fill-opacity": 0.35 },
      });
      map.addLayer({ id: "plots-line", type: "line", source: "plots", paint: { "line-color": "#ffffff", "line-width": 1.5 } });
      update(map);
    }} />
  );
}
