import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { MapConfig, SummaryChild } from "../app/types";
import { BLUE_RAMP } from "../lib/colors";
import { fmtHa } from "../lib/format";
import { MapView, fitBBox } from "./MapView";

/** Child units coloured by surveyed area (sequential blue). Click drills down. */
export function ChoroplethMap({
  config,
  units,
  onSelect,
}: {
  config: MapConfig;
  units: SummaryChild[];
  onSelect: (u: SummaryChild) => void;
}) {
  const mapRef = useRef<MlMap | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const unitsRef = useRef(units);
  unitsRef.current = units;
  const max = Math.max(1, ...units.map((u) => u.surveyed_area_ha ?? 0));

  const fc = {
    type: "FeatureCollection" as const,
    features: units
      .filter((u) => u.geometry)
      .map((u) => ({
        type: "Feature" as const,
        geometry: u.geometry!,
        properties: { id: u.id, name: u.name, area: u.surveyed_area_ha ?? 0 },
      })),
  };

  const update = (map: MlMap) => {
    (map.getSource("units") as GeoJSONSource | undefined)?.setData(fc as never);
    map.setPaintProperty("units-fill", "fill-color", [
      "case",
      ["==", ["get", "area"], 0], "#f1f5f9",
      ["interpolate", ["linear"], ["get", "area"], 0, BLUE_RAMP[0], max, BLUE_RAMP[BLUE_RAMP.length - 1]],
    ]);
    const xs = units.flatMap((u) => (u.bbox ? [u.bbox] : []));
    if (xs.length) {
      fitBBox(map, [Math.min(...xs.map((b) => b[0])), Math.min(...xs.map((b) => b[1])), Math.max(...xs.map((b) => b[2])), Math.max(...xs.map((b) => b[3]))], 20, 12);
    }
  };

  useEffect(() => {
    if (mapRef.current) update(mapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  return (
    <div className="relative h-64 overflow-hidden rounded-md border border-slate-200">
      <MapView
        config={config}
        onReady={(map) => {
          mapRef.current = map;
          map.addSource("units", { type: "geojson", data: fc as never });
          map.addLayer({ id: "units-fill", type: "fill", source: "units", paint: { "fill-color": BLUE_RAMP[0], "fill-opacity": 0.75 } });
          map.addLayer({ id: "units-line", type: "line", source: "units", paint: { "line-color": "#ffffff", "line-width": 2 } });
          map.on("click", "units-fill", (e) => {
            const id = e.features?.[0]?.properties?.id;
            const unit = unitsRef.current.find((u) => u.id === id);
            if (unit) selectRef.current(unit);
          });
          map.on("mouseenter", "units-fill", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "units-fill", () => (map.getCanvas().style.cursor = ""));
          update(map);
        }}
      />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[10px] text-slate-600 shadow-sm">
        <div className="mb-1 font-semibold">Surveyed area</div>
        <div className="flex items-center gap-1">
          <span>0</span>
          <span className="h-2 w-20 rounded-sm" style={{ background: `linear-gradient(to right, ${BLUE_RAMP.join(",")})` }} />
          <span>{fmtHa(max, 0)}</span>
        </div>
      </div>
    </div>
  );
}
