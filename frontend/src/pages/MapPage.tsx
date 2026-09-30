import maplibregl, { type Map as MlMap, type MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api, get, post } from "../app/api";
import { useAuth } from "../app/auth";
import { isTyping } from "../app/hotkeys";
import { usePage, type Crumb } from "../app/page";
import type {
  BBox, DashboardSummary, FeatureCollection, Level, Page, PlotDetail, PlotProps, SatelliteSeries, Survey,
} from "../app/types";
import { useMapConfig } from "../app/useMapConfig";
import { Icon } from "../components/Icon";
import { MapView, fitBBox, setBasemap, type Basemap } from "../components/MapView";
import { NdviChart } from "../components/charts/NdviChart";
import { Drawer } from "../components/map/Drawer";
import { LayerControl } from "../components/map/LayerControl";
import { Legend } from "../components/map/Legend";
import { Button, IconButton } from "../components/ui/Button";
import { Chip, StatusChip } from "../components/ui/Chip";
import { useConfirm } from "../components/ui/Confirm";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Field } from "../components/ui/Field";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { HEALTH_COLORS, HEALTH_LABELS } from "../lib/colors";
import { fmtDate, fmtHa, fmtNum, titleCase } from "../lib/format";
import {
  DEFAULT_LAYERS, STATUS_GROUP, applyLayerState, installOverlays, ringCenter, setData, setRasterLayer, sketchFeatures,
  type LayerState,
} from "../lib/mapLayers";
import { formatArea, formatDistance, pathLengthM, polygonAreaM2, type LngLat } from "../lib/measure";

type PlotFC = FeatureCollection<GeoJSON.Polygon, PlotProps>;
type Tool = "distance" | "area" | "draw" | null;
interface Unit { level: Level; id?: string; name: string }

const NEXT: Record<Level, Level | null> = { state: "district", district: "taluka", taluka: null, village: null };
const PAD = { top: 80, bottom: 60, left: 330, right: 420 };
const LABEL_MIN_ZOOM = 15;
const EMPTY = { type: "FeatureCollection", features: [] };

const bboxOf = (boxes: (BBox | null | undefined)[]): BBox | null => {
  const b = boxes.filter(Boolean) as BBox[];
  return b.length ? [Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))] : null;
};
const overlaps = (a: BBox | null, b: BBox | null) => !!a && !!b && a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

export default function MapPage() {
  const { data: config, error: configError } = useMapConfig();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [panelOpen, setPanelOpen] = useState(true);
  const [basemap, setBase] = useState<Basemap>("light");

  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [path, setPath] = useState<Unit[]>([{ level: "state", name: "Maharashtra" }]);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [plots, setPlots] = useState<PlotFC | null>(null);
  const [satellite, setSatellite] = useState<SatelliteSeries | null>(null);
  const [plot, setPlot] = useState<PlotDetail | null>(null);
  const [plotSat, setPlotSat] = useState<SatelliteSeries | null>(null);
  const [areaSurveys, setAreaSurveys] = useState<Survey[]>([]);

  const [tool, setTool] = useState<Tool>(null);
  const [sketch, setSketch] = useState<LngLat[]>([]);
  const [plotForm, setPlotForm] = useState<{ code: string; parcel: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(6);

  const selectedPlot = useRef<string | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const pin = useRef<maplibregl.Marker | null>(null);
  const toolRef = useRef<Tool>(null);
  toolRef.current = tool;
  const handlers = useRef<{ plot: (id: string) => void; survey: (id: string) => void; unit: (id: string, name: string) => void; add: (p: LngLat) => void }>();

  const canEdit = can("create_survey") && !!survey && survey.status !== "archived";

  // ---- breadcrumbs in the top bar -----------------------------------------
  const crumbs: Crumb[] = [
    { label: "GIS map", onClick: () => goToUnit({ level: "state", name: "Maharashtra" }) },
    ...path.map((u) => ({ label: u.name, onClick: () => goToUnit(u) })),
    ...(survey ? [{ label: survey.name, onClick: () => selectSurvey(survey.id) }] : []),
    ...(plot ? [{ label: `Plot ${plot.plot_code}` }] : []),
  ];
  usePage(plot ? `Plot ${plot.plot_code}` : survey?.name ?? "GIS map", crumbs);

  // ---- data -----------------------------------------------------------------
  useEffect(() => {
    get<Page<Survey>>("/api/surveys?geometry=true&page_size=500").then((p) => setSurveys(p.items)).catch(() => setSurveys([]));
  }, []);
  useEffect(() => {
    const t = setInterval(() => get("/api/auth/me").catch(() => {}), 5 * 60_000); // keep tile token fresh
    return () => clearInterval(t);
  }, []);

  const historical = useMemo(() => {
    const out = new Set<string>();
    for (const s of surveys ?? []) {
      if ((surveys ?? []).some((o) => o.id !== s.id && (o.survey_date ?? "") > (s.survey_date ?? "") && overlaps(o.bbox, s.bbox))) out.add(s.id);
    }
    return out;
  }, [surveys]);

  const clearPlot = useCallback(() => {
    const map = mapRef.current;
    if (map && selectedPlot.current) map.setFeatureState({ source: "plots", id: selectedPlot.current }, { selected: false });
    selectedPlot.current = null;
    setPlot(null);
    setPlotSat(null);
  }, []);

  const clearSurvey = useCallback(() => {
    clearPlot();
    setSurvey(null);
    setPlots(null);
    setSatellite(null);
    const map = mapRef.current;
    if (map) {
      setData(map, "plots", EMPTY);
      setRasterLayer(map, "ndvi", null, layers.ndvi);
    }
  }, [clearPlot, layers.ndvi]);

  const setUrl = useCallback((next: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    setParams(p, { replace: true });
  }, [setParams]);

  const goToUnit = useCallback(async (u: Unit, fit = true) => {
    clearSurvey();
    try {
      const summary = await get<DashboardSummary>(u.level === "state" ? "/api/dashboard/summary" : `/api/dashboard/summary?level=${u.level}&id=${u.id}`);
      const map = mapRef.current;
      const children = summary.children.filter((c) => c.geometry);
      const features = children.length
        ? children.map((c) => ({ type: "Feature", geometry: c.geometry, properties: { id: c.id, name: c.name } }))
        : summary.unit?.geometry ? [{ type: "Feature", geometry: summary.unit.geometry, properties: { id: summary.unit.id, name: summary.unit.name } }] : [];
      if (map) setData(map, "units", { type: "FeatureCollection", features });
      setPath([{ level: "state", name: "Maharashtra" }, ...summary.path.map((p) => ({ level: p.level, id: p.id, name: p.name }))]);
      setAreaSurveys(summary.children.filter((c) => c.level === "survey").map((c) => (surveys ?? []).find((s) => s.id === c.id)).filter(Boolean) as Survey[]);
      if (map && fit) fitBBox(map, summary.unit?.bbox ?? bboxOf(children.map((c) => c.bbox)), PAD, 15);
      setUrl(u.level === "state" ? {} : { level: u.level, id: u.id ?? null });
    } catch (e) {
      toast({ tone: "error", title: "Could not load area", body: (e as Error).message });
    }
  }, [clearSurvey, setUrl, surveys, toast]);

  const selectPlot = useCallback(async (plotId: string, fit = false) => {
    const map = mapRef.current;
    if (map && selectedPlot.current) map.setFeatureState({ source: "plots", id: selectedPlot.current }, { selected: false });
    selectedPlot.current = plotId;
    if (map) map.setFeatureState({ source: "plots", id: plotId }, { selected: true });
    setPlot(null);
    setPlotSat(null);
    try {
      const [detail, sat] = await Promise.all([get<PlotDetail>(`/api/plots/${plotId}`), get<SatelliteSeries>(`/api/plots/${plotId}/satellite`)]);
      setPlot(detail);
      setPlotSat(sat);
      if (fit && map) fitBBox(map, detail.bbox, { ...PAD, top: 120 }, 18);
      setUrl({ survey: detail.survey.id, plot: plotId });
    } catch (e) {
      toast({ tone: "error", title: "Could not load plot", body: (e as Error).message });
    }
  }, [setUrl, toast]);

  const loadPlots = useCallback(async (surveyId: string) => {
    const fc = await get<PlotFC>(`/api/surveys/${surveyId}/plots`);
    setPlots(fc);
    if (mapRef.current) setData(mapRef.current, "plots", fc);
    return fc;
  }, []);

  const selectSurvey = useCallback(async (surveyId: string, opts: { plotId?: string; fit?: boolean } = {}) => {
    const map = mapRef.current;
    if (!map) return;
    clearPlot();
    try {
      const [s, sat] = await Promise.all([get<Survey>(`/api/surveys/${surveyId}`), get<SatelliteSeries>(`/api/surveys/${surveyId}/satellite`)]);
      setSurvey(s);
      setSatellite(sat);
      await loadPlots(surveyId);
      setRasterLayer(map, "ndvi", sat.layer?.tiles_url ?? null, layers.ndvi, s.bbox, config?.satellite_source.attribution);
      if (opts.fit !== false) fitBBox(map, s.bbox, PAD, 18);
      const unitLevel: Level | null = s.taluka_id ? "taluka" : s.district_id ? "district" : null;
      if (unitLevel) {
        const summary = await get<DashboardSummary>(`/api/dashboard/summary?level=${unitLevel}&id=${unitLevel === "taluka" ? s.taluka_id : s.district_id}`);
        setPath([{ level: "state", name: "Maharashtra" }, ...summary.path.map((p) => ({ level: p.level, id: p.id, name: p.name }))]);
        setData(map, "units", summary.unit?.geometry ? { type: "Feature", geometry: summary.unit.geometry, properties: { id: summary.unit.id, name: summary.unit.name } } : EMPTY);
      }
      setUrl({ survey: s.id });
      if (opts.plotId) await selectPlot(opts.plotId, true);
    } catch (e) {
      toast({ tone: "error", title: "Could not load survey", body: e instanceof ApiError ? e.message : String(e) });
    }
  }, [clearPlot, config, layers.ndvi, loadPlots, selectPlot, setUrl, toast]);

  // ---- map wiring -----------------------------------------------------------
  const onReady = useCallback((map: MlMap) => {
    mapRef.current = map;
    installOverlays(map);
    setZoom(map.getZoom());
    let frame = 0;
    map.on("zoomend", () => setZoom(map.getZoom()));
    map.on("mousemove", (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCursor([e.lngLat.lng, e.lngLat.lat]));
    });
    map.on("mouseout", () => setCursor(null));

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "gm-popup" });
    let hoverPlot: string | number | undefined;
    let hoverUnit: string | number | undefined;
    map.on("mousemove", "plots-fill", (e) => {
      if (toolRef.current) return;
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      if (hoverPlot !== undefined) map.setFeatureState({ source: "plots", id: hoverPlot }, { hover: false });
      hoverPlot = f.id;
      map.setFeatureState({ source: "plots", id: hoverPlot! }, { hover: true });
      const p = f.properties as PlotProps;
      const el = document.createElement("div");
      const title = document.createElement("div");
      title.className = "font-semibold text-navy";
      title.textContent = `Plot ${p.plot_code}`;
      const body = document.createElement("div");
      body.className = "num text-slate-600";
      body.textContent = `${Number(p.area_ha ?? 0).toFixed(2)} ha · NDVI ${p.sat_ndvi == null || p.sat_ndvi === ("null" as never) ? "–" : Number(p.sat_ndvi).toFixed(2)}`;
      el.append(title, body);
      popup.setLngLat(e.lngLat).setDOMContent(el).addTo(map);
    });
    map.on("mouseleave", "plots-fill", () => {
      map.getCanvas().style.cursor = toolRef.current ? "crosshair" : "";
      if (hoverPlot !== undefined) map.setFeatureState({ source: "plots", id: hoverPlot }, { hover: false });
      hoverPlot = undefined;
      popup.remove();
    });
    map.on("mousemove", "units-fill", (e) => {
      if (toolRef.current || map.queryRenderedFeatures(e.point, { layers: ["plots-fill"] }).length) return;
      const f = e.features?.[0];
      if (hoverUnit !== undefined) map.setFeatureState({ source: "units", id: hoverUnit }, { hover: false });
      hoverUnit = f?.id;
      if (hoverUnit !== undefined) map.setFeatureState({ source: "units", id: hoverUnit }, { hover: true });
    });
    map.on("mouseleave", "units-fill", () => {
      if (hoverUnit !== undefined) map.setFeatureState({ source: "units", id: hoverUnit }, { hover: false });
      hoverUnit = undefined;
    });

    map.on("click", (e: MapMouseEvent) => {
      const h = handlers.current;
      if (!h) return;
      if (toolRef.current) return h.add([e.lngLat.lng, e.lngLat.lat]);
      const visible = ["plots-fill", "surveys-fill", "units-fill"].filter((l) => map.getLayoutProperty(l, "visibility") !== "none");
      const hits = map.queryRenderedFeatures(e.point, { layers: visible });
      const p = hits.find((f) => f.layer.id === "plots-fill");
      if (p) return h.plot(String(p.properties.id));
      const s = hits.find((f) => f.layer.id === "surveys-fill");
      if (s) return h.survey(String(s.properties.id));
      const u = hits.find((f) => f.layer.id === "units-fill");
      if (u) h.unit(String(u.properties.id), String(u.properties.name));
    });
    setReady(true);
  }, []);

  handlers.current = {
    plot: (id) => selectPlot(id),
    survey: (id) => { if (id !== survey?.id) selectSurvey(id); },
    unit: (id, name) => {
      if (survey) return;
      const current = path[path.length - 1];
      const next = NEXT[current.level];
      if (next && id !== current.id) goToUnit({ level: next, id, name });
    },
    add: (p) => setSketch((pts) => [...pts, p]),
  };

  // Initial view from the URL once the map and survey list are ready.
  const initialised = useRef(false);
  useEffect(() => {
    if (!ready || surveys === null || initialised.current) return;
    initialised.current = true;
    const lat = params.get("lat"), lon = params.get("lon");
    if (params.get("survey")) {
      selectSurvey(params.get("survey")!, { plotId: params.get("plot") ?? undefined }).then(() => params.get("draw") && setTool("draw"));
    } else if (params.get("level") && params.get("id")) {
      goToUnit({ level: params.get("level") as Level, id: params.get("id")!, name: "…" });
    } else {
      goToUnit({ level: "state", name: "Maharashtra" });
    }
    if (lat && lon && mapRef.current) {
      pin.current = new maplibregl.Marker({ color: "#0B1F3A" }).setLngLat([Number(lon), Number(lat)]).addTo(mapRef.current);
      mapRef.current.flyTo({ center: [Number(lon), Number(lat)], zoom: 15 });
    }
  }, [ready, surveys, params, selectSurvey, goToUnit]);

  // React to URL changes made by the command palette while on this page.
  const lastSearch = useRef(params.toString());
  useEffect(() => {
    const now = params.toString();
    if (!initialised.current || now === lastSearch.current) return;
    lastSearch.current = now;
    const sid = params.get("survey"), pid = params.get("plot");
    if (sid && sid !== survey?.id) selectSurvey(sid, { plotId: pid ?? undefined });
    else if (sid && pid && pid !== plot?.id) selectPlot(pid, true);
    else if (!sid && params.get("level") && params.get("id") && params.get("id") !== path[path.length - 1].id) {
      goToUnit({ level: params.get("level") as Level, id: params.get("id")!, name: "…" });
    }
    const lat = params.get("lat"), lon = params.get("lon");
    if (lat && lon && mapRef.current) {
      pin.current?.remove();
      pin.current = new maplibregl.Marker({ color: "#0B1F3A" }).setLngLat([Number(lon), Number(lat)]).addTo(mapRef.current);
      mapRef.current.flyTo({ center: [Number(lon), Number(lat)], zoom: 15 });
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // Survey outlines.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !surveys) return;
    const f = (s: Survey) => ({ type: "Feature", geometry: s.aoi, properties: { id: s.id, name: s.name, selected: s.id === survey?.id, status_group: STATUS_GROUP[s.status] ?? "planning" } });
    const withAoi = surveys.filter((s) => s.aoi);
    setData(map, "surveys", { type: "FeatureCollection", features: withAoi.filter((s) => !historical.has(s.id) || s.id === survey?.id).map(f) });
    setData(map, "history", { type: "FeatureCollection", features: withAoi.filter((s) => historical.has(s.id) && s.id !== survey?.id).map(f) });
  }, [ready, surveys, historical, survey]);

  useEffect(() => {
    if (ready && mapRef.current) applyLayerState(mapRef.current, layers, config?.crops ?? []);
  }, [ready, layers, config, satellite]);

  useEffect(() => { if (ready && mapRef.current) setBasemap(mapRef.current, basemap); }, [ready, basemap]);

  // Plot labels as HTML markers (no glyph server needed).
  useEffect(() => {
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const map = mapRef.current;
    if (!map || !plots || !layers.labels || !layers.plots || zoom < LABEL_MIN_ZOOM || plots.features.length > 400) return;
    for (const f of plots.features) {
      const el = document.createElement("div");
      el.className = "pointer-events-none select-none rounded bg-white/90 px-1.5 py-px text-[10px] font-semibold text-navy shadow-e1";
      el.textContent = f.properties.plot_code;
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat(ringCenter(f.geometry.coordinates[0])).addTo(map));
    }
  }, [plots, layers.labels, layers.plots, zoom]);

  // Sketch geometry (draw / measure).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setData(map, "draw", tool === "draw" ? sketchFeatures(sketch, true) : EMPTY);
    setData(map, "measure", tool === "distance" || tool === "area" ? sketchFeatures(sketch, tool === "area") : EMPTY);
    map.getCanvas().style.cursor = tool ? "crosshair" : "";
    map.doubleClickZoom[tool ? "disable" : "enable"]();
  }, [ready, sketch, tool]);

  // Keyboard: L toggles layers, Esc cancels tool / closes drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return;
      if (e.key === "l" || e.key === "L") setPanelOpen((o) => !o);
      if (e.key === "Escape") {
        if (tool) { setTool(null); setSketch([]); } else if (plot) clearPlot();
      }
      if (e.key === "Enter" && tool === "draw" && sketch.length >= 3) setPlotForm({ code: "", parcel: "" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, plot, sketch.length, clearPlot]);

  const startTool = (t: Tool) => { setSketch([]); setTool(tool === t ? null : t); };

  const savePlot = async () => {
    if (!survey || !plotForm) return;
    setSaving(true);
    try {
      const res = await post<{ id: string; plot_code: string; warnings: string[] }>(`/api/surveys/${survey.id}/plots`, {
        geometry: { type: "Polygon", coordinates: [[...sketch, sketch[0]]] },
        plot_code: plotForm.code.trim() || null, parcel_ref: plotForm.parcel.trim() || null,
      });
      toast({ tone: "success", title: `Plot ${res.plot_code} saved`, body: res.warnings[0] });
      setPlotForm(null);
      setSketch([]);
      setTool(null);
      await loadPlots(survey.id);
      selectPlot(res.id);
    } catch (e) {
      toast({ tone: "error", title: "Could not save plot", body: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const deletePlot = async () => {
    if (!plot || !survey) return;
    if (!(await confirm({ title: `Delete plot ${plot.plot_code}?`, body: "The boundary is removed from this survey (audit-logged).", confirmLabel: "Delete", danger: true }))) return;
    try {
      await api(`/api/plots/${plot.id}`, { method: "DELETE" });
      toast({ tone: "success", title: `Plot ${plot.plot_code} deleted` });
      clearPlot();
      loadPlots(survey.id);
    } catch (e) {
      toast({ tone: "error", title: "Could not delete plot", body: (e as Error).message });
    }
  };

  if (configError) return <div className="p-6"><EmptyState icon="alert" title="Map unavailable" body={configError} /></div>;
  if (!config) return <div className="h-full p-6"><Skeleton className="h-full w-full" /></div>;

  const attribution = [config.boundaries.attribution].filter(Boolean) as string[];
  const measureText = tool === "area"
    ? sketch.length >= 3 ? formatArea(polygonAreaM2(sketch)) : "Click 3 or more points"
    : tool === "distance" ? (sketch.length >= 2 ? formatDistance(pathLengthM(sketch)) : "Click points along the line") : "";
  const current = path[path.length - 1];
  const noSurveys = surveys !== null && surveys.length === 0;

  return (
    <div className="relative h-full min-h-[480px] overflow-hidden">
      <MapView config={config} onReady={onReady} attribution={attribution} basemap={basemap} />

      {/* Left: layer control with the legend under it */}
      <div className="pointer-events-none absolute bottom-8 left-3 top-3 z-10 flex w-72 flex-col gap-2">
        {panelOpen ? (
          <div className="pointer-events-auto flex min-h-0 shrink">
            <LayerControl state={layers} onChange={setLayers} config={config} satellite={satellite} hasSurvey={!!survey}
              hasCrops={!!plots?.features.some((f) => f.properties.crop_pred)} onClose={() => setPanelOpen(false)} />
          </div>
        ) : (
          <Button className="pointer-events-auto self-start" icon="layers" onClick={() => setPanelOpen(true)} aria-label="Show layers (L)">Layers</Button>
        )}
        <div className="pointer-events-auto mt-auto shrink-0"><Legend state={layers} config={config} satellite={satellite} hasPlots={!!plots?.features.length} /></div>
      </div>

      {/* Top centre: tools */}
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-e2" role="toolbar" aria-label="Map tools">
        <IconButton icon="ruler" label="Measure distance" active={tool === "distance"} onClick={() => startTool("distance")} />
        <IconButton icon="polygon" label="Measure area" active={tool === "area"} onClick={() => startTool("area")} />
        {canEdit && <><span className="mx-1 h-5 w-px bg-slate-200" /><Button size="sm" variant={tool === "draw" ? "primary" : "ghost"} icon="pencil" onClick={() => startTool("draw")}>Draw plot</Button></>}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <IconButton icon="fit" label="Zoom to selection" onClick={() => mapRef.current && fitBBox(mapRef.current, survey?.bbox ?? bboxOf((surveys ?? []).map((s) => s.bbox)), PAD, 17)} />
        <IconButton icon={basemap === "light" ? "moon" : "sun"} label={basemap === "light" ? "Dark basemap" : "Light basemap"} onClick={() => setBase(basemap === "light" ? "dark" : "light")} />
      </div>

      {/* Active tool readout */}
      {tool && (
        <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-navy px-4 py-2 text-sm text-white shadow-e3" role="status">
          {tool === "draw" ? (
            <>
              <span>Click the plot corners · <b className="num">{sketch.length}</b> points{sketch.length >= 3 && <> · <span className="num">{formatArea(polygonAreaM2(sketch))}</span></>}</span>
              <button className="rounded px-2 py-0.5 text-navy-100 hover:bg-white/10" disabled={!sketch.length} onClick={() => setSketch((s) => s.slice(0, -1))}>Undo</button>
              <Button size="sm" variant="accent" disabled={sketch.length < 3} onClick={() => setPlotForm({ code: "", parcel: "" })}>Finish</Button>
            </>
          ) : <span className="num font-semibold">{measureText}</span>}
          <button className="rounded px-2 py-0.5 text-navy-100 hover:bg-white/10" onClick={() => { setTool(null); setSketch([]); }}>Cancel</button>
        </div>
      )}

      {/* Bottom-right: coordinates (scale bar is a MapLibre control) */}
      <div className="num absolute bottom-9 right-3 z-10 rounded bg-white/90 px-2 py-0.5 font-mono text-2xs text-slate-700 shadow-e1" style={{ right: plot || survey ? 400 : 12 }}>
        {cursor ? `${cursor[1].toFixed(5)}, ${cursor[0].toFixed(5)}` : "lat, lon"} · z{zoom.toFixed(1)}
      </div>

      {/* Empty state */}
      {noSurveys && !survey && (
        <div className="absolute bottom-10 left-1/2 z-10 w-[26rem] -translate-x-1/2">
          <div className="floating">
            <EmptyState compact icon="surveys" title="No surveys yet"
              body="District and taluka boundaries are loaded. Create a survey to add plots, Sentinel-2 NDVI and weather."
              action={can("create_survey") ? <Button variant="primary" icon="plus" onClick={() => navigate("/surveys/new")}>Plan your first survey</Button> : undefined} />
          </div>
        </div>
      )}

      {/* Right: drawer */}
      {plot ? (
        <Drawer title={`Plot ${plot.plot_code}`} subtitle={`${plot.survey.name} · ${fmtDate(plot.survey.survey_date)}`} onClose={clearPlot}
          footer={<>
            <Link to={`/surveys/${plot.survey.id}`} className="flex-1"><Button className="w-full" icon="surveys">Survey page</Button></Link>
            {canEdit && <Button variant="ghost" icon="trash" onClick={deletePlot} aria-label="Delete plot">Delete</Button>}
          </>}>
          <PlotDetails plot={plot} props={plots?.features.find((f) => f.properties.id === plot.id)?.properties} sat={plotSat} />
        </Drawer>
      ) : survey ? (
        <Drawer title={survey.name} subtitle={`${titleCase(survey.type)} · ${fmtDate(survey.survey_date)}`} onClose={() => goToUnit(current)}
          footer={<Link to={`/surveys/${survey.id}`} className="flex-1"><Button className="w-full" variant="primary" icon="surveys">Open survey</Button></Link>}>
          <SurveyDetails survey={survey} plots={plots} satellite={satellite} onPlot={(id) => selectPlot(id, true)} canEdit={canEdit} onDraw={() => startTool("draw")} />
        </Drawer>
      ) : current.level === "taluka" ? (
        <Drawer title={current.name} subtitle="Surveys in this taluka" onClose={() => goToUnit(path[path.length - 2] ?? path[0])}>
          {areaSurveys.length ? (
            <ul className="-mx-2 space-y-1">
              {areaSurveys.map((s) => (
                <li key={s.id}><button onClick={() => selectSurvey(s.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                  <Icon name="surveys" className="h-4 w-4 text-slate-400" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-navy">{s.name}</span><span className="num block text-xs text-slate-500">{fmtDate(s.survey_date)} · {fmtHa(s.aoi_area_ha, 2)} · {s.plot_count} plots</span></span>
                  <StatusChip status={s.status} />
                </button></li>
              ))}
            </ul>
          ) : <EmptyState compact icon="surveys" title="No surveys in this taluka" action={can("create_survey") ? <Button size="sm" variant="primary" icon="plus" onClick={() => navigate("/surveys/new")}>New survey</Button> : undefined} />}
        </Drawer>
      ) : null}

      <Dialog open={!!plotForm} onClose={() => setPlotForm(null)} title="Save plot" description={`${formatArea(polygonAreaM2(sketch))} · ${sketch.length} corners`}
        footer={<><Button onClick={() => setPlotForm(null)}>Keep drawing</Button><Button variant="primary" loading={saving} onClick={savePlot}>Save plot</Button></>}>
        <div className="space-y-4">
          <Field id="plot-code" label="Plot code" hint="Leave empty to number automatically (P-001, P-002 …)">
            <input id="plot-code" className="input" value={plotForm?.code ?? ""} onChange={(e) => setPlotForm((f) => f && { ...f, code: e.target.value })} />
          </Field>
          <Field id="plot-parcel" label="Parcel reference" hint="Gat / survey number from land records, if known">
            <input id="plot-parcel" className="input" value={plotForm?.parcel ?? ""} onChange={(e) => setPlotForm((f) => f && { ...f, parcel: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="eyebrow">{label}</dt><dd className="num mt-0.5 text-sm font-medium text-slate-900">{children}</dd></div>;
}

function SurveyDetails({ survey, plots, satellite, onPlot, canEdit, onDraw }: {
  survey: Survey; plots: PlotFC | null; satellite: SatelliteSeries | null; onPlot: (id: string) => void; canEdit: boolean; onDraw: () => void;
}) {
  const latest = satellite?.latest_clear;
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-4">
        <Stat label="Status"><StatusChip status={survey.status} /></Stat>
        <Stat label="Area">{fmtHa(survey.aoi_area_ha, 2)}</Stat>
        <Stat label="Taluka">{survey.taluka_name ?? "–"}</Stat>
        <Stat label="Plots">{plots?.features.length ?? "–"}</Stat>
      </dl>
      <section>
        <h3 className="eyebrow mb-2">Sentinel-2</h3>
        {latest ? (
          <p className="text-sm">Latest clear scene <b>{fmtDate(latest.date)}</b>: mean NDVI <b className="num">{latest.ndvi_mean?.toFixed(2)}</b> ({(latest.clear_fraction * 100).toFixed(0)}% cloud-free)</p>
        ) : <p className="text-sm text-slate-500">No clear Sentinel-2 scene yet. Refresh it from the survey page.</p>}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="eyebrow">Plots</h3>{canEdit && <button className="text-xs font-medium text-navy-600 hover:underline" onClick={onDraw}>Draw plot</button>}</div>
        {plots?.features.length ? (
          <ul className="-mx-2 max-h-80 overflow-y-auto">
            {plots.features.map(({ properties: p }) => (
              <li key={p.id}><button onClick={() => onPlot(p.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.sat_health ? HEALTH_COLORS[p.sat_health] : "#94a3b8" }} />
                <span className="flex-1 text-sm font-medium text-navy">{p.plot_code}</span>
                <span className="num text-xs text-slate-500">{fmtHa(p.area_ha, 2)}</span>
                <span className="num w-10 text-right text-xs text-slate-600">{fmtNum(p.sat_ndvi, 2)}</span>
              </button></li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">No plots yet. Draw them on the map or import GeoJSON / KML / shapefile on the survey page.</p>}
      </section>
    </div>
  );
}

function PlotDetails({ plot, props, sat }: { plot: PlotDetail; props?: PlotProps; sat: SatelliteSeries | null }) {
  const latest = sat?.latest_clear;
  const health = props?.sat_health;
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-4">
        <Stat label="Area">{fmtHa(plot.area_ha, 2)}</Stat>
        <Stat label="Parcel ref.">{plot.parcel_ref ?? "–"}</Stat>
        <Stat label="Boundary source">{props?.source?.replace("import:", "Imported · ") ?? "–"}</Stat>
        <Stat label="Field check">{plot.verification.status === "ai_only" ? <Chip>Not verified</Chip> : <StatusChip status={plot.verification.status} />}</Stat>
      </dl>
      <section className="rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">Crop condition (Sentinel-2)</h3>
          {health && <Chip dot={HEALTH_COLORS[health]}>{HEALTH_LABELS[health]}</Chip>}
        </div>
        {latest ? (
          <p className="mt-2 text-sm">NDVI <b className="num">{latest.ndvi_mean?.toFixed(3)}</b> on {fmtDate(latest.date)} · p10–p90 <span className="num">{latest.ndvi_p10?.toFixed(2)}–{latest.ndvi_p90?.toFixed(2)}</span></p>
        ) : <p className="mt-2 text-sm text-slate-500">No cloud-free observation of this plot yet.</p>}
        <p className="mt-1 text-2xs text-slate-500">Decision support; thresholds are indicative. Final decisions are made by authorized officers.</p>
      </section>
      {sat && sat.series.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">NDVI history</h3>
          <NdviChart series={sat.series} minClear={sat.min_clear_fraction} height={180} />
          <p className="mt-2 text-2xs text-slate-500">{sat.source} · {sat.attribution}</p>
        </section>
      )}
    </div>
  );
}
