import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../app/api";
import { useAuth } from "../app/auth";
import { usePage } from "../app/page";
import type {
  FeatureCollection, Job, Mission, PlotProps, RefreshResponse, SatelliteSeries, Survey, WeatherResponse,
} from "../app/types";
import { useApi } from "../app/useApi";
import { useMapConfig } from "../app/useMapConfig";
import { usePolling } from "../app/usePolling";
import { Icon } from "../components/Icon";
import { PreflightChecklist } from "../components/PreflightChecklist";
import { SurveyMiniMap } from "../components/SurveyMiniMap";
import { NdviChart } from "../components/charts/NdviChart";
import { WeatherCharts } from "../components/charts/WeatherCharts";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, SourceNote } from "../components/ui/Card";
import { Chip, StatusChip } from "../components/ui/Chip";
import { useConfirm } from "../components/ui/Confirm";
import { DataTable, type Column } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { Tabs } from "../components/ui/Tabs";
import { useToast } from "../components/ui/Toast";
import { HEALTH_COLORS, HEALTH_LABELS } from "../lib/colors";
import { satelliteState } from "../lib/emptyStates";
import { fmtDate, fmtHa, fmtNum, titleCase } from "../lib/format";

type PlotFC = FeatureCollection<GeoJSON.Polygon, PlotProps>;

function JobStatus({ job, what }: { job: Job | null | undefined; what: string }) {
  if (!job) return null;
  if (job.status === "queued" || job.status === "running") {
    return <span className="flex items-center gap-2 text-xs text-slate-600"><span className="h-3 w-3 animate-spin rounded-full border-2 border-navy-200 border-r-navy" />{what} in progress · {Math.round(job.progress * 100)}%</span>;
  }
  return (
    <span className="flex items-center gap-2 text-xs text-slate-500">
      <StatusChip status={job.status} /> {job.finished_at ? `Last run ${new Date(job.finished_at).toLocaleString("en-IN")}` : ""}
    </span>
  );
}

function FailedJob({ job, service }: { job: Job; service: string }) {
  const last = (job.log ?? "").trim().split("\n").filter((l) => l.includes("ERROR")).pop() ?? job.log;
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
      <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
      <div className="min-w-0">
        <p className="font-medium text-red-900">The last {service} refresh failed</p>
        <p className="mt-1 break-words font-mono text-xs text-red-800">{last}</p>
        <p className="mt-2 text-xs text-red-800">If the service is unreachable from this server, check its network access and try again. Previously stored data is kept.</p>
      </div>
    </div>
  );
}

function useRefresher(path: string, label: string, reload: () => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (force = false) => {
    setBusy(true);
    try {
      const res = await api<RefreshResponse>(`${path}${force ? "?force=true" : ""}`, { method: "POST" });
      if (res.cached) toast({ tone: "info", title: `${label} is up to date`, body: "Refreshed recently; showing cached results." });
      else if (res.job.status === "failed") toast({ tone: "error", title: `${label} refresh failed`, body: res.job.log?.split("\n").filter(Boolean).pop() });
      else if (res.job.status === "done") toast({ tone: "success", title: `${label} updated` });
      else toast({ tone: "info", title: `${label} refresh started`, body: "Runs in the background; this page updates automatically." });
    } catch (e) {
      toast({ tone: "error", title: `Could not refresh ${label}`, body: (e as Error).message });
    } finally {
      setBusy(false);
      reload();
    }
  };
  return { busy, run };
}

function SatelliteTab({ surveyId, canRefresh }: { surveyId: string; canRefresh: boolean }) {
  const sat = useApi<SatelliteSeries>(`/api/surveys/${surveyId}/satellite`);
  const running = !!sat.data?.job && ["queued", "running"].includes(sat.data.job.status);
  usePolling(running, sat.reload);
  const { busy, run } = useRefresher(`/api/surveys/${surveyId}/satellite/refresh`, "Sentinel-2", sat.reload);
  const d = sat.data;
  if (!d) return <SkeletonCard lines={6} />;
  const columns: Column<(typeof d.series)[number]>[] = [
    { key: "date", header: "Date", value: (r) => r.date, render: (r) => <span className="num">{fmtDate(r.date)}</span> },
    { key: "platform", header: "Platform", value: (r) => r.platform ?? "", render: (r) => titleCase(r.platform) },
    { key: "cloud", header: "Scene cloud", align: "right", value: (r) => r.scene_cloud_pct, render: (r) => r.scene_cloud_pct == null ? "–" : `${r.scene_cloud_pct.toFixed(0)}%` },
    { key: "clear", header: "Cloud-free over AOI", align: "right", value: (r) => r.clear_fraction, render: (r) => `${(r.clear_fraction * 100).toFixed(0)}%` },
    { key: "ndvi", header: "Mean NDVI", align: "right", value: (r) => r.ndvi_mean, render: (r) => fmtNum(r.ndvi_mean, 3) },
    { key: "range", header: "p10 – p90", align: "right", render: (r) => r.ndvi_p10 == null ? "–" : `${fmtNum(r.ndvi_p10, 2)} – ${fmtNum(r.ndvi_p90, 2)}` },
    { key: "scene", header: "Scene", value: (r) => r.scene_id, render: (r) => <span className="font-mono text-2xs text-slate-500">{r.scene_id}</span> },
  ];
  const refresh = canRefresh && (
    <Button variant="primary" icon="refresh" loading={busy || running} onClick={() => run(!!d.job)}>{d.job ? "Refresh Sentinel-2" : "Fetch Sentinel-2"}</Button>
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Sentinel-2 NDVI time series" subtitle="Cloud-masked (SCL) NDVI over the survey area, last 12 months"
          actions={<><JobStatus job={d.job} what="Satellite refresh" />{refresh}</>} />
        <CardBody>
          {d.job?.status === "failed" && <div className="mb-4"><FailedJob job={d.job} service="Sentinel-2" /></div>}
          {(() => {
            switch (satelliteState(d)) {
              case "never":
              case "failed-no-data":
                return <EmptyState icon="satellite" title="No satellite data yet"
                  body="Fetch the last 12 months of Sentinel-2 L2A scenes for this area. Clouds are masked with the scene classification layer."
                  action={refresh || undefined} />;
              case "running":
              case "loading":
                return <SkeletonCard lines={4} />;
              case "no-scenes":
                return <EmptyState icon="satellite" title="No Sentinel-2 scenes found" body="No scene in the last 12 months intersected this area under the cloud limit." />;
              case "all-cloudy":
                return (<>
                  <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    All {d.scenes_total} scenes were too cloudy (under {Math.round(d.min_clear_fraction * 100)}% cloud-free), so no NDVI layer was produced.
                  </p>
                  <NdviChart series={d.series} minClear={d.min_clear_fraction} />
                </>);
              default:
                return <NdviChart series={d.series} minClear={d.min_clear_fraction} />;
            }
          })()}
          <SourceNote>{d.source} ({d.attribution}) · {d.licence} · STAC {d.stac_url}</SourceNote>
        </CardBody>
      </Card>
      {d.series.length > 0 && (
        <DataTable rows={[...d.series].reverse()} columns={columns} rowKey={(r) => r.scene_id} filterPlaceholder="Filter scenes…" pageSize={25} maxHeight="28rem" />
      )}
    </div>
  );
}

function WeatherTab({ surveyId, canRefresh }: { surveyId: string; canRefresh: boolean }) {
  const w = useApi<WeatherResponse>(`/api/surveys/${surveyId}/weather`);
  const running = !!w.data?.job && ["queued", "running"].includes(w.data.job.status);
  usePolling(running, w.reload);
  const { busy, run } = useRefresher(`/api/surveys/${surveyId}/weather/refresh`, "Weather", w.reload);
  const d = w.data;
  if (!d) return <SkeletonCard lines={6} />;
  const refresh = canRefresh && <Button variant="primary" icon="refresh" loading={busy || running} onClick={() => run(!!d.job)}>{d.days.length ? "Refresh weather" : "Fetch weather"}</Button>;
  return (
    <Card>
      <CardHeader title="Weather at the survey area" subtitle="Daily rainfall and temperature at the AOI centroid: last 90 days and 7-day forecast"
        actions={<><JobStatus job={d.job} what="Weather refresh" />{refresh}</>} />
      <CardBody>
        {d.job?.status === "failed" && <div className="mb-4"><FailedJob job={d.job} service="Open-Meteo" /></div>}
        {!d.days.length ? (
          <EmptyState icon="rain" title="No weather data yet" body="Fetch daily rainfall and temperature from Open-Meteo for this area." action={refresh || undefined} />
        ) : (
          <>
            <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><dt className="eyebrow">Rain, last 30 days</dt><dd className="num mt-1 text-xl font-semibold text-navy">{d.totals.rain_mm_last_30d?.toFixed(0) ?? "–"} mm</dd></div>
              <div><dt className="eyebrow">Rain, last 90 days</dt><dd className="num mt-1 text-xl font-semibold text-navy">{d.totals.rain_mm_last_90d?.toFixed(0) ?? "–"} mm</dd></div>
              <div><dt className="eyebrow">Days stored</dt><dd className="num mt-1 text-xl font-semibold text-navy">{d.days.length}</dd></div>
              <div><dt className="eyebrow">Fetched</dt><dd className="mt-1 text-sm text-slate-700">{d.fetched_at ? new Date(d.fetched_at).toLocaleString("en-IN") : "–"}</dd></div>
            </dl>
            <WeatherCharts days={d.days} />
          </>
        )}
        <SourceNote>{d.attribution} · {d.licence} · archive (reanalysis) for past days, forecast API for the last few days and the next 7.</SourceNote>
      </CardBody>
    </Card>
  );
}

function PlotsTab({ survey, plots, reload, canEdit }: { survey: Survey; plots: PlotFC | null; reload: () => void; canEdit: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const rows = plots?.features.map((f) => f.properties) ?? [];

  const onImport = async (f: File) => {
    const form = new FormData();
    form.append("file", f);
    setBusy(true);
    try {
      const res = await api<{ created: unknown[]; skipped: unknown[]; warnings: string[] }>(`/api/surveys/${survey.id}/plots/import`, { method: "POST", body: form });
      toast({ tone: "success", title: `${res.created.length} plots imported from ${f.name}`, body: [res.skipped.length ? `${res.skipped.length} skipped (invalid geometry).` : "", ...res.warnings.slice(0, 2)].filter(Boolean).join(" ") || undefined });
      reload();
    } catch (e) {
      toast({ tone: "error", title: "Import failed", body: e instanceof ApiError ? e.message : String(e) });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  const remove = async (p: PlotProps) => {
    if (!(await confirm({ title: `Delete plot ${p.plot_code}?`, body: "The plot boundary is removed from this survey. This is recorded in the audit log.", confirmLabel: "Delete plot", danger: true }))) return;
    try {
      await api(`/api/plots/${p.id}`, { method: "DELETE" });
      toast({ tone: "success", title: `Plot ${p.plot_code} deleted` });
      reload();
    } catch (e) {
      toast({ tone: "error", title: "Could not delete plot", body: (e as Error).message });
    }
  };

  const columns: Column<PlotProps>[] = [
    { key: "code", header: "Plot", value: (p) => p.plot_code, render: (p) => <span className="font-medium text-navy">{p.plot_code}</span> },
    { key: "parcel", header: "Parcel ref.", value: (p) => p.parcel_ref ?? "", render: (p) => p.parcel_ref ?? <span className="text-slate-400">–</span> },
    { key: "area", header: "Area", align: "right", value: (p) => p.area_ha, render: (p) => fmtHa(p.area_ha, 2) },
    { key: "ndvi", header: "NDVI (S2)", align: "right", value: (p) => p.sat_ndvi, render: (p) => fmtNum(p.sat_ndvi, 2) },
    { key: "health", header: "Health", value: (p) => p.sat_health ?? "", render: (p) => p.sat_health
      ? <Chip dot={HEALTH_COLORS[p.sat_health]}>{HEALTH_LABELS[p.sat_health]}</Chip> : <span className="text-slate-400">–</span> },
    { key: "date", header: "As of", value: (p) => p.sat_date ?? "", render: (p) => <span className="num text-slate-500">{fmtDate(p.sat_date)}</span> },
    { key: "source", header: "Source", value: (p) => p.source ?? "", render: (p) => <span className="text-xs text-slate-500">{p.source?.replace("import:", "Imported · ") ?? "–"}</span> },
    { key: "verification", header: "Field check", value: (p) => p.verification_status, render: (p) => p.verification_status === "ai_only" ? <Chip>Not verified</Chip> : <StatusChip status={p.verification_status} /> },
    ...(canEdit ? [{ key: "actions", header: "", render: (p: PlotProps) => (
      <button aria-label={`Delete plot ${p.plot_code}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" onClick={(e) => { e.stopPropagation(); remove(p); }}>
        <Icon name="trash" className="h-4 w-4" />
      </button>) }] : []),
  ];

  const actions = canEdit && (
    <>
      <input ref={file} type="file" className="hidden" accept=".geojson,.json,.kml,.zip" aria-label="Plot boundary file"
        onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      <Button icon="upload" size="sm" loading={busy} onClick={() => file.current?.click()}>Import GeoJSON / KML / SHP</Button>
      <Button icon="polygon" size="sm" variant="primary" onClick={() => navigate(`/map?survey=${survey.id}&draw=1`)}>Draw on map</Button>
    </>
  );

  return (
    <DataTable rows={rows} columns={columns} rowKey={(p) => p.id} filterPlaceholder="Filter plots…" toolbar={actions}
      onRowClick={(p) => navigate(`/map?survey=${survey.id}&plot=${p.id}`)} initialSort={{ key: "code", dir: "asc" }}
      empty={<EmptyState icon="polygon" title="No plots yet"
        body="Import parcel boundaries (GeoJSON, KML or a zipped shapefile) or draw them on the map. Plot boundaries are never generated automatically."
        action={actions || undefined} />} />
  );
}

export default function SurveyDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const survey = useApi<Survey>(`/api/surveys/${id}`);
  const plots = useApi<PlotFC>(`/api/surveys/${id}/plots`);
  const missions = useApi<Mission[]>(`/api/surveys/${id}/missions`);
  const sat = useApi<SatelliteSeries>(`/api/surveys/${id}/satellite`);
  const weather = useApi<WeatherResponse>(`/api/surveys/${id}/weather`);
  const { data: config } = useMapConfig();
  const s = survey.data;

  usePage(s?.name ?? "Survey", [
    { label: "Surveys", to: "/surveys" },
    ...(s?.district_name ? [{ label: s.district_name }] : []),
    ...(s?.taluka_name ? [{ label: s.taluka_name }] : []),
    { label: s?.name ?? "Survey" },
  ]);

  useEffect(() => {
    const w = (location.state as { warnings?: string[] } | null)?.warnings;
    w?.forEach((msg) => toast({ tone: "info", title: "Survey saved with a note", body: msg }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = useMemo(() => [
    { id: "overview", label: "Overview" },
    { id: "plots", label: "Plots", count: plots.data?.features.length },
    { id: "satellite", label: "Sentinel-2" },
    { id: "weather", label: "Weather" },
    ...(missions.data?.length ? [{ id: "missions", label: "Missions", count: missions.data.length }] : []),
  ], [plots.data, missions.data]);

  if (survey.error) return <div className="p-6"><EmptyState icon="alert" title="Survey not found" body={survey.error} action={<Link to="/surveys" className="text-sm font-medium text-navy-600 hover:underline">Back to surveys</Link>} /></div>;
  if (!s) return <div className="grid gap-4 p-6 lg:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>;

  const canEdit = can("create_survey") && s.status !== "archived";
  const attribution = [config?.boundaries.attribution, sat.data?.layer ? config?.satellite_source.attribution : null].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{s.name}</h1>
            <StatusChip status={s.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {titleCase(s.type)} · {fmtDate(s.survey_date)} · {[s.taluka_name, s.district_name].filter(Boolean).join(", ") || "No admin unit"} · {fmtHa(s.aoi_area_ha, 2)}
          </p>
        </div>
        <Link to={`/map?survey=${s.id}`}><Button icon="map">Open in GIS map</Button></Link>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Survey sections" />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && (
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="overflow-hidden xl:col-span-2">
              <div className="h-[26rem]">
                {config && <SurveyMiniMap config={config} survey={s} plots={plots.data} ndviTiles={sat.data?.layer?.tiles_url} attribution={attribution} />}
              </div>
              {sat.data?.layer && (
                <div className="border-t border-slate-100 px-5 py-2 text-2xs text-slate-500">
                  NDVI layer: Sentinel-2 L2A · {fmtDate(sat.data.layer.acquired_at?.slice(0, 10))} · {sat.data.layer.cloud_cover?.toFixed(0)}% scene cloud · {sat.data.layer.scene_id}
                </div>
              )}
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader title="Survey facts" />
                <CardBody>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="eyebrow">Area</dt><dd className="num mt-0.5 font-medium">{fmtHa(s.aoi_area_ha, 2)}</dd></div>
                    <div><dt className="eyebrow">Plots</dt><dd className="num mt-0.5 font-medium">{plots.data?.features.length ?? "–"}</dd></div>
                    <div><dt className="eyebrow">Season</dt><dd className="mt-0.5">{s.season ?? "–"}</dd></div>
                    <div><dt className="eyebrow">Created</dt><dd className="num mt-0.5">{new Date(s.created_at).toLocaleDateString("en-IN")}</dd></div>
                    <div><dt className="eyebrow">District</dt><dd className="mt-0.5">{s.district_name ?? "–"}</dd></div>
                    <div><dt className="eyebrow">Taluka</dt><dd className="mt-0.5">{s.taluka_name ?? "–"}</dd></div>
                  </dl>
                  {s.notes && <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">{s.notes}</p>}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Latest observations" />
                <CardBody className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <Icon name="satellite" className="mt-0.5 h-4 w-4 text-slate-400" />
                    {sat.data?.latest_clear ? (
                      <p>Sentinel-2 {fmtDate(sat.data.latest_clear.date)}: mean NDVI <b className="num">{sat.data.latest_clear.ndvi_mean?.toFixed(2)}</b>, {(sat.data.latest_clear.clear_fraction * 100).toFixed(0)}% cloud-free</p>
                    ) : <p className="text-slate-500">No clear Sentinel-2 scene yet. <button className="font-medium text-navy-600 hover:underline" onClick={() => setTab("satellite")}>Open Sentinel-2</button></p>}
                  </div>
                  <div className="flex items-start gap-3">
                    <Icon name="rain" className="mt-0.5 h-4 w-4 text-slate-400" />
                    {weather.data?.days.length ? (
                      <p>Rain: <b className="num">{weather.data.totals.rain_mm_last_30d?.toFixed(0)} mm</b> in 30 days, <b className="num">{weather.data.totals.rain_mm_last_90d?.toFixed(0)} mm</b> in 90 days</p>
                    ) : <p className="text-slate-500">No weather data yet. <button className="font-medium text-navy-600 hover:underline" onClick={() => setTab("weather")}>Open weather</button></p>}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        )}
        {tab === "plots" && <PlotsTab survey={s} plots={plots.data} reload={plots.reload} canEdit={canEdit} />}
        {tab === "satellite" && <SatelliteTab surveyId={s.id} canRefresh={can("create_survey")} />}
        {tab === "weather" && <WeatherTab surveyId={s.id} canRefresh={can("create_survey")} />}
        {tab === "missions" && (
          <div className="space-y-4">
            {missions.data?.map((m, i) => (
              <Card key={m.id}>
                <CardHeader title={`Mission ${i + 1}`} subtitle={`${m.camera_profile} · ${m.altitude_m} m AGL · overlap ${Math.round(m.front_overlap * 100)}/${Math.round(m.side_overlap * 100)}%`} actions={<StatusChip status={m.status} />} />
                <CardBody><PreflightChecklist missionId={m.id} onChange={missions.reload} /></CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
