import maplibregl, { type Map as MlMap, type MapLayerMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../app/api";
import type {
  BBox, DashboardSummary, Feature, FeatureCollection, Level, Page, PlotDetail, PlotProps, RasterInfo,
  SearchResult, Survey, TimelinePoint,
} from "../app/types";
import { useMapConfig } from "../app/useMapConfig";
import { DemoBadge } from "../components/DemoBadge";
import { LayerPanel } from "../components/LayerPanel";
import { MapView, fitBBox } from "../components/MapView";
import { PlotPanel } from "../components/PlotPanel";
import { SearchBar } from "../components/SearchBar";
import { fmtDate, titleCase } from "../lib/format";
import {
  DEFAULT_LAYERS, STATUS_GROUP, applyLayerState, installOverlays, ringCenter, setData, setRasterLayer,
  type LayerState,
} from "../lib/mapLayers";
import { formatArea, formatDistance, pathLengthM, polygonAreaM2, type LngLat } from "../lib/measure";

type PlotFC = FeatureCollection<GeoJSON.Polygon, PlotProps>;
interface Crumb { level: Level | "survey"; id?: string; name: string; bbox?: BBox | null }

const EMPTY_FC = { type: "FeatureCollection", features: [] };
const NEXT: Record<Level, Level | null> = { state: "district", district: "taluka", taluka: "village", village: null };
const LABEL_MIN_ZOOM = 14.5;
// Leave room for the search / breadcrumb overlays at the top of the map.
const FIT_PADDING = { top: 130, bottom: 40, left: 40, right: 40 };

const bboxOverlap = (a: BBox | null, b: BBox | null) =>
  !!a && !!b && a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Older surveys overlapping a newer one are "historical"; the rest are current. */
function splitHistory(surveys: Survey[]) {
  const done = new Set(["processed", "verified", "archived"]);
  const historical = new Set<string>();
  for (const s of surveys) {
    if (!done.has(s.status) || !s.survey_date) continue;
    if (surveys.some((o) => o.id !== s.id && done.has(o.status) && o.survey_date && o.survey_date > s.survey_date! && bboxOverlap(o.bbox, s.bbox))) {
      historical.add(s.id);
    }
  }
  return historical;
}

const surveyFeature = (s: Survey) => ({
  type: "Feature",
  geometry: s.aoi,
  properties: { id: s.id, name: s.name, status: s.status, status_group: STATUS_GROUP[s.status] ?? "planning" },
});

export function GisMap() {
  const { data: config, error: configError } = useMapConfig();
  const [params, setParams] = useSearchParams();
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [panelOpen, setPanelOpen] = useState(true);

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ level: "state", name: "Maharashtra" }]);
  const [siblings, setSiblings] = useState<Survey[]>([]);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [plots, setPlots] = useState<PlotFC | null>(null);
  const [rasters, setRasters] = useState<RasterInfo[]>([]);
  const [plot, setPlot] = useState<PlotDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [measureMode, setMeasureMode] = useState<"distance" | "area" | null>(null);
  const [measurePts, setMeasurePts] = useState<LngLat[]>([]);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(0);

  const selectedPlotRef = useRef<string | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const pointMarkerRef = useRef<maplibregl.Marker | null>(null);
  const handlersRef = useRef<{ plot: (id: string) => void; survey: (id: string) => void; unit: (id: string) => void; measure: (p: LngLat) => void }>();

  const historical = useMemo(() => splitHistory(surveys), [surveys]);

  // ---- data loading -------------------------------------------------------
  useEffect(() => {
    get<Page<Survey>>("/api/surveys?geometry=true&page_size=500")
      .then((p) => setSurveys(p.items))
      .catch((e) => setError(e.message));
  }, []);

  // Keep the access token fresh for tile requests (the API client refreshes on 401).
  useEffect(() => {
    const t = setInterval(() => get("/api/auth/me").catch(() => {}), 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  const showUnits = useCallback((summary: DashboardSummary) => {
    const map = mapRef.current;
    if (!map) return;
    const children = summary.children.filter((c) => c.geometry);
    const features = children.length
      ? children.map((c) => ({ type: "Feature", geometry: c.geometry, properties: { id: c.id, name: c.name, level: c.level } }))
      : summary.unit?.geometry
        ? [{ type: "Feature", geometry: summary.unit.geometry, properties: { id: summary.unit.id, name: summary.unit.name, level: summary.level } }]
        : [];
    setData(map, "units", { type: "FeatureCollection", features });
  }, []);

  const clearPlot = useCallback(() => {
    const map = mapRef.current;
    if (map && selectedPlotRef.current) map.setFeatureState({ source: "plots", id: selectedPlotRef.current }, { selected: false });
    selectedPlotRef.current = null;
    setPlot(null);
    setTimeline([]);
  }, []);

  const clearSurvey = useCallback(() => {
    clearPlot();
    setSurvey(null);
    setPlots(null);
    setRasters([]);
    setSiblings([]);
    const map = mapRef.current;
    if (map) {
      setData(map, "plots", EMPTY_FC);
      setRasterLayer(map, "ndvi", null, layers.ndvi);
      setRasterLayer(map, "ortho", null, layers.ortho);
    }
  }, [clearPlot, layers.ndvi, layers.ortho]);

  const goToUnit = useCallback(async (level: Level, id?: string, fit = true) => {
    clearSurvey();
    const path = level === "state" ? "/api/dashboard/summary" : `/api/dashboard/summary?level=${level}&id=${id}`;
    try {
      const summary = await get<DashboardSummary>(path);
      showUnits(summary);
      setCrumbs([{ level: "state", name: "Maharashtra" }, ...summary.path.map((p) => ({ level: p.level, id: p.id, name: p.name, bbox: p.bbox }))]);
      const map = mapRef.current;
      if (map && fit) {
        const boxes = summary.children.map((c) => c.bbox).filter(Boolean) as BBox[];
        const target = summary.unit?.bbox ?? (boxes.length
          ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] as BBox
          : null);
        if (target) fitBBox(map, target, FIT_PADDING, 16);
      }
      params.delete("survey");
      params.delete("plot");
      setParams(params, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [clearSurvey, params, setParams, showUnits]);

  const selectPlot = useCallback(async (plotId: string, fit = false) => {
    const map = mapRef.current;
    if (map && selectedPlotRef.current) map.setFeatureState({ source: "plots", id: selectedPlotRef.current }, { selected: false });
    selectedPlotRef.current = plotId;
    if (map) map.setFeatureState({ source: "plots", id: plotId }, { selected: true });
    setPanelOpen(true);
    try {
      const [detail, tl] = await Promise.all([
        get<PlotDetail>(`/api/plots/${plotId}`),
        get<{ points: TimelinePoint[] }>(`/api/plots/${plotId}/timeline`),
      ]);
      setPlot(detail);
      setTimeline(tl.points);
      if (fit && map) fitBBox(map, detail.bbox, 120, 18);
      params.set("plot", plotId);
      setParams(params, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [params, setParams]);

  const selectSurvey = useCallback(async (surveyId: string, opts: { plotId?: string; fit?: boolean } = {}) => {
    const map = mapRef.current;
    if (!map) return;
    clearPlot();
    try {
      const [s, fc, rs] = await Promise.all([
        get<Survey>(`/api/surveys/${surveyId}`),
        get<PlotFC>(`/api/surveys/${surveyId}/plots`),
        get<RasterInfo[]>(`/api/surveys/${surveyId}/rasters`),
      ]);
      setSurvey(s);
      setPlots(fc);
      setRasters(rs);
      setData(map, "plots", fc);
      const ortho = rs.find((r) => r.kind === "orthomosaic");
      const ndvi = rs.find((r) => r.kind === "ndvi");
      setRasterLayer(map, "ortho", ortho?.tiles_url ?? null, layers.ortho, ortho?.bounds);
      setRasterLayer(map, "ndvi", ndvi?.tiles_url ?? null, layers.ndvi, ndvi?.bounds);
      if (opts.fit !== false) fitBBox(map, s.bbox, FIT_PADDING, 18);

      // Breadcrumbs + sibling (dated) surveys of the same village.
      if (s.village_id) {
        const village = await get<DashboardSummary>(`/api/dashboard/summary?level=village&id=${s.village_id}`);
        showUnits(village);
        setCrumbs([
          { level: "state", name: "Maharashtra" },
          ...village.path.map((p) => ({ level: p.level, id: p.id, name: p.name, bbox: p.bbox })),
          { level: "survey", id: s.id, name: `${fmtDate(s.survey_date)}` },
        ]);
      } else {
        setCrumbs([{ level: "state", name: "Maharashtra" }, { level: "survey", id: s.id, name: s.name }]);
      }
      params.set("survey", s.id);
      params.delete("plot");
      setParams(params, { replace: true });
      if (opts.plotId) await selectPlot(opts.plotId, true);
    } catch (e) {
      setError((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearPlot, selectPlot, showUnits, params, setParams]);

  // Sibling surveys (same village) for the date switcher.
  useEffect(() => {
    if (!survey?.village_id) return setSiblings([]);
    setSiblings(surveys.filter((s) => s.village_id === survey.village_id).sort((a, b) => (b.survey_date ?? "").localeCompare(a.survey_date ?? "")));
  }, [survey, surveys]);

  // ---- map wiring ---------------------------------------------------------
  const onReady = useCallback((map: MlMap) => {
    mapRef.current = map;
    installOverlays(map);
    setZoom(map.getZoom());
    map.on("zoom", () => setZoom(map.getZoom()));
    map.on("mousemove", (e) => setCursor([e.lngLat.lng, e.lngLat.lat]));
    map.on("mouseout", () => setCursor(null));
    for (const id of ["plots-fill", "plots-line", "surveys-fill", "units-fill"]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("click", (e: MapLayerMouseEvent) => {
      const h = handlersRef.current;
      if (!h) return;
      if (h.measure && measureActiveRef.current) {
        h.measure([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      const layersAt = ["plots-fill", "plots-line", "surveys-fill", "units-fill"].filter((l) => map.getLayer(l) && map.getLayoutProperty(l, "visibility") !== "none");
      const hits = map.queryRenderedFeatures(e.point, { layers: layersAt });
      const plotHit = hits.find((f) => f.layer.id.startsWith("plots"));
      if (plotHit) return h.plot(String(plotHit.properties.id));
      const surveyHit = hits.find((f) => f.layer.id === "surveys-fill");
      if (surveyHit) return h.survey(String(surveyHit.properties.id));
      const unitHit = hits.find((f) => f.layer.id === "units-fill");
      if (unitHit) h.unit(String(unitHit.properties.id));
    });
    setReady(true);
  }, []);

  const measureActiveRef = useRef(false);
  measureActiveRef.current = measureMode !== null;

  const currentLevel = crumbs[crumbs.length - 1];
  handlersRef.current = {
    plot: (id) => selectPlot(id),
    survey: (id) => { if (id !== survey?.id) selectSurvey(id); },
    unit: (id) => {
      if (survey || currentLevel.level === "survey") return; // inside a survey, units are context only
      const next = NEXT[currentLevel.level as Level];
      if (next) goToUnit(next, id);
    },
    measure: (p) => setMeasurePts((pts) => [...pts, p]),
  };

  // Initial selection once the map and survey list are ready.
  const initialised = useRef(false);
  useEffect(() => {
    if (!ready || initialised.current) return;
    if (!surveys.length && !error) return;
    initialised.current = true;
    const wanted = params.get("survey");
    const latest = surveys.find((s) => !historical.has(s.id) && ["processed", "verified"].includes(s.status));
    if (wanted) selectSurvey(wanted, { plotId: params.get("plot") ?? undefined });
    else if (latest) selectSurvey(latest.id);
    else goToUnit("state");
  }, [ready, surveys, error, historical, params, selectSurvey, goToUnit]);

  // Survey status (current) and historical outlines.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const withAoi = surveys.filter((s) => s.aoi);
    setData(map, "surveys", { type: "FeatureCollection", features: withAoi.filter((s) => !historical.has(s.id)).map(surveyFeature) });
    setData(map, "history", { type: "FeatureCollection", features: withAoi.filter((s) => historical.has(s.id) && s.id !== survey?.id).map(surveyFeature) });
  }, [ready, surveys, historical, survey]);

  // Layer visibility / styling.
  useEffect(() => {
    if (ready && mapRef.current) applyLayerState(mapRef.current, layers, config?.crops ?? []);
  }, [ready, layers, config, rasters]);

  // Plot labels (HTML markers; no glyph server needed). Crop names are added
  // under the code when the crop theme is on (identity is never colour-only).
  useEffect(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const map = mapRef.current;
    if (!map || !plots || !layers.labels || !layers.plots || zoom < LABEL_MIN_ZOOM) return;
    for (const f of plots.features as Feature<GeoJSON.Polygon, PlotProps>[]) {
      const el = document.createElement("div");
      el.className = "pointer-events-none select-none rounded bg-white/85 px-1 text-[10px] font-semibold leading-tight text-navy shadow-sm text-center";
      el.textContent = f.properties.plot_code;
      if (layers.theme === "crop" && f.properties.crop_pred) {
        const sub = document.createElement("div");
        sub.className = "font-normal text-slate-600";
        sub.textContent = titleCase(f.properties.crop_pred);
        el.appendChild(sub);
      }
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat(ringCenter(f.geometry.coordinates[0])).addTo(map));
    }
  }, [plots, layers.labels, layers.plots, layers.theme, zoom]);

  // Measure geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: unknown[] = measurePts.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: {} }));
    if (measurePts.length >= 2) {
      features.push(
        measureMode === "area" && measurePts.length >= 3
          ? { type: "Feature", geometry: { type: "Polygon", coordinates: [[...measurePts, measurePts[0]]] }, properties: {} }
          : { type: "Feature", geometry: { type: "LineString", coordinates: measurePts }, properties: {} },
      );
    }
    setData(map, "measure", { type: "FeatureCollection", features });
    map.doubleClickZoom[measureMode ? "disable" : "enable"]();
  }, [ready, measurePts, measureMode]);

  const onSearch = (r: SearchResult) => {
    const map = mapRef.current;
    if (!map) return;
    pointMarkerRef.current?.remove();
    if (r.type === "coordinate" && r.point) {
      pointMarkerRef.current = new maplibregl.Marker({ color: "#0B1F3A" }).setLngLat(r.point).addTo(map);
      map.flyTo({ center: r.point, zoom: Math.max(map.getZoom(), 16) });
    } else if (r.type === "district" || r.type === "taluka" || r.type === "village") {
      goToUnit(r.type, r.id);
    } else if (r.type === "survey") {
      selectSurvey(r.id);
    } else if (r.type === "plot" && r.survey_id) {
      if (r.survey_id === survey?.id) selectPlot(r.id, true);
      else selectSurvey(r.survey_id, { plotId: r.id });
    } else if (r.type === "crop" && r.survey_id) {
      setLayers((l) => ({ ...l, theme: "crop", plots: true }));
      if (r.survey_id !== survey?.id) selectSurvey(r.survey_id);
    }
  };

  const measureText = measureMode === "area"
    ? measurePts.length >= 3 ? formatArea(polygonAreaM2(measurePts)) : "Click at least 3 points"
    : measurePts.length >= 2 ? formatDistance(pathLengthM(measurePts)) : "Click points along the line";

  if (configError) return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{configError}</p>;
  if (!config) return <p className="text-sm text-slate-500">Loading map...</p>;

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] lg:-m-6 lg:h-[calc(100%+3rem)]">
      {/* Layer panel */}
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 md:block">
        <LayerPanel state={layers} onChange={setLayers} rasters={rasters} crops={config.crops}
          hasSatellite={!!config.satellite.tiles_url} hasSurvey={!!plots} />
      </aside>

      <div className="relative min-w-0 flex-1">
        <MapView config={config} onReady={onReady} />

        {/* Top overlay: search + breadcrumbs + survey date */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <SearchBar onSelect={onSearch} />
            <div className="flex gap-1 rounded-md bg-white p-1 shadow-sm">
              {(["distance", "area"] as const).map((m) => (
                <button key={m} className={`rounded px-2 py-1 text-xs font-medium ${measureMode === m ? "bg-navy text-white" : "text-slate-700 hover:bg-slate-100"}`}
                  onClick={() => { setMeasureMode(measureMode === m ? null : m); setMeasurePts([]); }}>
                  Measure {m}
                </button>
              ))}
            </div>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <nav aria-label="Drill-down" className="flex flex-wrap items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-xs shadow-sm">
              {crumbs.map((c, i) => (
                <span key={`${c.level}-${c.id ?? "root"}`} className="flex items-center gap-1">
                  {i > 0 && <span className="text-slate-400">›</span>}
                  <button
                    disabled={i === crumbs.length - 1}
                    className={i === crumbs.length - 1 ? "font-semibold text-navy" : "text-slate-600 hover:text-navy hover:underline"}
                    onClick={() => c.level !== "survey" && goToUnit(c.level, c.id)}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            {survey && (
              <div className="flex items-center gap-2 rounded-md bg-white/95 px-2 py-1 text-xs shadow-sm">
                <label htmlFor="survey-date" className="text-slate-500">Survey</label>
                <select id="survey-date" className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                  value={survey.id} onChange={(e) => selectSurvey(e.target.value, { fit: false })}>
                  {(siblings.length ? siblings : [survey]).map((s) => (
                    <option key={s.id} value={s.id}>{fmtDate(s.survey_date)} — {s.name}</option>
                  ))}
                </select>
                {survey.is_demo && <DemoBadge />}
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="pointer-events-auto max-w-md rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700 shadow-sm">
              {error} <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
            </p>
          )}
        </div>

        {measureMode && (
          <div className="absolute left-3 top-32 rounded-md bg-white px-3 py-2 text-sm shadow-md">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Measure {measureMode}</div>
            <div className="font-semibold tabular-nums text-navy">{measureText}</div>
            <div className="mt-1 flex gap-2 text-xs">
              <button className="text-navy underline" onClick={() => setMeasurePts((p) => p.slice(0, -1))}>Undo</button>
              <button className="text-navy underline" onClick={() => setMeasurePts([])}>Clear</button>
              <button className="text-navy underline" onClick={() => { setMeasureMode(null); setMeasurePts([]); }}>Done</button>
            </div>
          </div>
        )}

        {/* Coordinate readout */}
        <div className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-0.5 font-mono text-[11px] text-slate-700 shadow-sm">
          {cursor ? `${cursor[1].toFixed(6)}, ${cursor[0].toFixed(6)}` : "lat, lon"} · z{zoom.toFixed(1)}
        </div>
      </div>

      {/* Plot panel */}
      {plot && panelOpen && (
        <aside className="w-80 shrink-0 border-l border-slate-200 bg-white">
          <PlotPanel plot={plot} timeline={timeline} onClose={clearPlot} />
        </aside>
      )}
    </div>
  );
}
