import { useAuth } from "../app/auth";
import { usePage } from "../app/page";
import { ROLE_LABELS } from "../app/types";
import { useApi } from "../app/useApi";
import { useMapConfig } from "../app/useMapConfig";
import { Icon } from "../components/Icon";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Chip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";

interface Health { status: string; postgis: string; telemetry_mode: string }

const CAPABILITY_LABELS: Record<string, string> = {
  view_dashboard: "View dashboards", view_map: "Use the GIS map", create_survey: "Create surveys and plots", authorize_mission: "Authorize missions",
  request_authorization: "Request mission authorization", upload_flight_data: "Upload flight data", fly_mission: "Fly missions",
  view_processing: "View processing", view_plot_intelligence: "View plot intelligence", submit_verification: "Submit field verification",
  final_decision: "Record final decisions", review_verifications: "Review verifications", manage_users: "Manage users",
  view_reports: "View reports", view_audit_log: "View the audit log",
};

export default function Account() {
  usePage("Account & data sources");
  const { user, can } = useAuth();
  const { data: config } = useMapConfig();
  const { data: health } = useApi<Health>("/api/health");
  if (!user) return null;
  const sources = [
    ...(config?.boundaries.datasets ?? []).map((d) => ({ name: d.name, provider: d.provider, detail: `${d.version ?? ""} · original source: ${d.original_source ?? "–"}`, licence: d.licence, url: d.url })),
    ...(config ? [{ name: "Sentinel-2 L2A surface reflectance", provider: "Copernicus / ESA via Element 84 Earth Search", detail: config.satellite_source.attribution, licence: config.satellite_source.licence, url: config.satellite_source.stac_url }] : []),
    { name: "Daily weather (rain, temperature)", provider: "Open-Meteo", detail: "ERA5-based archive and forecast API", licence: "CC BY 4.0", url: "https://open-meteo.com/" },
    ...(config ? [{ name: "Basemap", provider: config.basemaps.light.attribution, detail: "Raster tiles (configurable)", licence: "ODbL (OpenStreetMap data)", url: "https://www.openstreetmap.org/copyright" }] : []),
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-xl font-semibold tracking-tight">Account & data sources</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Your account" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div><dt className="eyebrow">Name</dt><dd className="mt-0.5">{user.name}</dd></div>
              <div><dt className="eyebrow">Email</dt><dd className="mt-0.5">{user.email}</dd></div>
              <div><dt className="eyebrow">Role</dt><dd className="mt-0.5 flex items-center gap-2">{ROLE_LABELS[user.role]}{user.is_demo && <Chip tone="warning">Demo account</Chip>}</dd></div>
              <div><dt className="eyebrow">Permissions</dt><dd className="mt-1 flex flex-wrap gap-1">{user.capabilities.map((c) => <Chip key={c}>{CAPABILITY_LABELS[c] ?? c}</Chip>)}</dd></div>
            </dl>
          </CardBody>
        </Card>
        {can("submit_verification") && !can("view_map") ? (
          <Card>
            <CardHeader title="Field assignments" />
            <EmptyState icon="pin" title="No plots assigned to you yet" body="When an officer assigns plots for field verification, they appear here and in the field app." />
          </Card>
        ) : (
          <Card>
            <CardHeader title="System status" />
            <CardBody>
              {health ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-accent-600" /><dt>API</dt><dd className="ml-auto">{health.status}</dd></div>
                  <div className="flex items-center gap-2"><Icon name="database" className="h-4 w-4 text-slate-400" /><dt>PostGIS</dt><dd className="num ml-auto">{health.postgis}</dd></div>
                </dl>
              ) : <p className="text-sm text-slate-500">Checking…</p>}
            </CardBody>
          </Card>
        )}
      </div>
      <Card>
        <CardHeader title="Data sources and licences" subtitle="Every dataset shown in the platform, with its origin and licence" />
        <ul className="divide-y divide-slate-100">
          {sources.map((s) => (
            <li key={s.name} className="grid gap-1 px-5 py-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-600">{s.provider}</p>
                <p className="truncate text-2xs text-slate-500">{s.detail}</p>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <Chip tone="brand">{s.licence}</Chip>
                {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-navy-600 hover:text-navy" aria-label={`${s.name} source`}><Icon name="external" className="h-4 w-4" /></a>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
