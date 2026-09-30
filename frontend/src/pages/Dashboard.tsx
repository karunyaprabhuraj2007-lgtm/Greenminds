import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";
import { usePage, type Crumb } from "../app/page";
import type { Alert, DashboardSummary, Level, Page, SummaryChild } from "../app/types";
import { useApi } from "../app/useApi";
import { useMapConfig } from "../app/useMapConfig";
import { AlertsFeed } from "../components/AlertsFeed";
import { ChoroplethMap } from "../components/ChoroplethMap";
import { HealthDonut } from "../components/HealthDonut";
import { StatCard } from "../components/StatCard";
import { VerificationFunnel } from "../components/VerificationFunnel";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, SourceNote } from "../components/ui/Card";
import { StatusChip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";
import { SkeletonCard } from "../components/ui/Skeleton";
import { dashboardState } from "../lib/emptyStates";
import { fmtDate, fmtHa, fmtPct } from "../lib/format";

interface Scope { level: Level; id?: string; name: string }
const NEXT: Record<Level, Level | null> = { state: "district", district: "taluka", taluka: null, village: null };
const CHILD_LABEL: Record<Level, string> = { state: "Districts", district: "Talukas", taluka: "Surveys", village: "Surveys" };

export default function Dashboard() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [scopes, setScopes] = useState<Scope[]>([{ level: "state", name: "Maharashtra" }]);
  const scope = scopes[scopes.length - 1];
  const path = scope.level === "state" ? "/api/dashboard/summary" : `/api/dashboard/summary?level=${scope.level}&id=${scope.id}`;
  const { data, error, loading } = useApi<DashboardSummary>(path);
  const alerts = useApi<Page<Alert>>("/api/alerts?page_size=6");
  const { data: mapConfig } = useMapConfig();

  const crumbs: Crumb[] = [
    { label: "Dashboard", onClick: () => setScopes(scopes.slice(0, 1)) },
    ...scopes.map((s, i) => ({ label: s.name, onClick: () => setScopes(scopes.slice(0, i + 1)) })),
  ];
  usePage("Dashboard", crumbs);

  const drill = (child: SummaryChild) => {
    if (child.level === "survey") return navigate(`/surveys/${child.id}`);
    const next = NEXT[scope.level];
    if (next) setScopes([...scopes, { level: next, id: child.id, name: child.name }]);
  };

  const monthly = useMemo(() => data?.trends.surveys_per_month.map((p) => p.value) ?? [], [data]);
  const ndvi = useMemo(() => data?.trends.ndvi_monthly_mean.map((p) => p.value) ?? [], [data]);

  if (error) return <div className="p-6"><EmptyState icon="alert" title="Dashboard unavailable" body={error} /></div>;

  const c = data?.cards;
  const state = dashboardState(data);
  const first = state === "first-run";

  return (
    <div className={`mx-auto max-w-[1440px] space-y-6 p-6 transition-opacity ${loading && data ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{scope.name}</h1>
        </div>
        {can("create_survey") && <Button variant="primary" icon="plus" onClick={() => navigate("/surveys/new")}>New survey</Button>}
      </div>

      {first ? (
        <Card>
          <EmptyState icon="surveys" title="No surveys yet"
            body="Surveys you create appear here with their area, mapped plots, Sentinel-2 crop health and field verifications."
            action={can("create_survey") ? <Button variant="primary" icon="plus" onClick={() => navigate("/surveys/new")}>Plan your first survey</Button>
              : <p className="text-sm text-slate-500">Surveys created by operators in your district will appear here.</p>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <StatCard loading={!data} icon="surveys" label="Surveys" value={c?.surveys_total.toLocaleString("en-IN")}
            hint={c && `${c.active_surveys} active · ${c.completed_surveys} completed`} trend={monthly} trendLabel="Surveys created per month, last 12 months" />
          <StatCard loading={!data} icon="map" label="Surveyed area" value={c && fmtHa(c.total_surveyed_area_ha)} hint="Union of survey areas" />
          <StatCard loading={!data} icon="polygon" label="Plots mapped" value={c?.plots_mapped.toLocaleString("en-IN")} hint={c && `${fmtHa(c.plots_area_ha)} drawn or imported`} />
          <StatCard loading={!data} icon="shield" label="Field verifications" value={c?.field_verifications.toLocaleString("en-IN")} hint={c && `${c.pending_verifications} plots pending`} />
          <StatCard loading={!data} icon="leaf" label="Healthy crop area" value={c?.healthy_pct != null ? fmtPct(c.healthy_pct) : "—"}
            hint={c && (c.health_assessed_plots ? `${c.health_assessed_plots} plots · Sentinel-2` : "No clear satellite scene yet")} />
          <StatCard loading={!data} icon="satellite" label="Last clear Sentinel-2" value={c?.last_clear_satellite_date ? fmtDate(c.last_clear_satellite_date) : "—"}
            hint={c && `${c.satellite_monitored_surveys} surveys monitored`} trend={ndvi} trendLabel="Monthly mean NDVI of monitored surveys" />
        </div>
      )}

      {!first && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader title="Crop health" subtitle="Share of plot area by Sentinel-2 NDVI class" />
            <CardBody>
              {!data ? <SkeletonCard lines={4} /> : state === "ok" ? (
                <>
                  <HealthDonut health={data.health} />
                  <SourceNote>{data.health_basis.source}, latest clear scene per plot{data.health_basis.as_of ? ` (up to ${fmtDate(data.health_basis.as_of)})` : ""}. {data.health_basis.description}</SourceNote>
                </>
              ) : (
                <EmptyState compact icon="satellite" title="No crop health yet"
                  body={state === "no-health" ? "Refresh Sentinel-2 on a survey to classify its plots." : "Map plots on a survey, then refresh Sentinel-2."}
                  action={data.basis.survey_ids[0] ? <Link className="text-sm font-medium text-navy-600 hover:underline" to={`/surveys/${data.basis.survey_ids[0]}`}>Open survey</Link> : undefined} />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Field verification" subtitle="Satellite / AI assessment vs field-checked plots" />
            <CardBody>
              {!data ? <SkeletonCard lines={3} /> : data.cards.plots_mapped ? (
                <>
                  <VerificationFunnel stages={data.verification_funnel} />
                  <SourceNote>Decision support only. Final decisions are made by authorized officers.</SourceNote>
                </>
              ) : <EmptyState compact icon="shield" title="No plots to verify" body="Plots appear here once they are drawn or imported on a survey." />}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Alerts" />
            <CardBody className="py-1"><AlertsFeed alerts={alerts.data?.items ?? []} onChange={alerts.reload} /></CardBody>
          </Card>
        </div>
      )}

      {data && (
        <Card>
          <CardHeader title={`${CHILD_LABEL[data.level]} in ${scope.name}`}
            subtitle={data.level === "taluka" ? "Dated surveys in this taluka" : "Click a unit on the map or in the table to drill down"} />
          <div className={`grid gap-0 ${mapConfig && data.children.some((ch) => ch.geometry) ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" : ""}`}>
            {mapConfig && data.children.some((ch) => ch.geometry) && (
              <div className="border-b border-slate-100 p-4 lg:border-b-0 lg:border-r">
                <ChoroplethMap config={mapConfig} units={data.children} onSelect={drill} />
              </div>
            )}
            <div className="max-h-[26rem] overflow-y-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    {(data.level === "taluka"
                      ? ["Survey", "Date", "Area", "Status"]
                      : [CHILD_LABEL[data.level].slice(0, -1), "Surveys", "Surveyed", "Plots", "Healthy"]).map((h, i) => (
                      <th key={h} className={`sticky top-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 ${i ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...data.children].sort((a, b) => (b.surveys ?? 0) - (a.surveys ?? 0) || a.name.localeCompare(b.name)).map((ch) => (
                    <tr key={ch.id} tabIndex={0} onClick={() => drill(ch)} onKeyDown={(e) => e.key === "Enter" && drill(ch)}
                      className="cursor-pointer hover:bg-slate-50 focus-visible:bg-navy-50">
                      <td className="border-b border-slate-100 px-4 py-2 font-medium text-navy">{ch.name}</td>
                      {ch.level === "survey" ? (
                        <>
                          <td className="num border-b border-slate-100 px-4 py-2 text-right">{fmtDate(ch.survey_date)}</td>
                          <td className="num border-b border-slate-100 px-4 py-2 text-right">{fmtHa(ch.aoi_area_ha, 2)}</td>
                          <td className="border-b border-slate-100 px-4 py-2 text-right"><StatusChip status={ch.status ?? "draft"} /></td>
                        </>
                      ) : (
                        <>
                          <td className="num border-b border-slate-100 px-4 py-2 text-right">{ch.surveys || "—"}</td>
                          <td className="num border-b border-slate-100 px-4 py-2 text-right">{ch.surveys ? fmtHa(ch.surveyed_area_ha) : "—"}</td>
                          <td className="num border-b border-slate-100 px-4 py-2 text-right">{ch.plots_mapped || "—"}</td>
                          <td className="num border-b border-slate-100 px-4 py-2 text-right">{fmtPct(ch.healthy_pct)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.children.length && <EmptyState compact icon="surveys" title="No surveys in this taluka yet" />}
            </div>
          </div>
          {mapConfig?.boundaries.attribution && <div className="border-t border-slate-100 px-5 py-2"><SourceNote>{mapConfig.boundaries.attribution}</SourceNote></div>}
        </Card>
      )}
    </div>
  );
}
