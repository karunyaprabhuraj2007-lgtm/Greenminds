import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Alert, DashboardSummary, Level, Page, SummaryChild } from "../app/types";
import { useApi } from "../app/useApi";
import { useMapConfig } from "../app/useMapConfig";
import { AlertsFeed } from "../components/AlertsFeed";
import { ChoroplethMap } from "../components/ChoroplethMap";
import { CropTable } from "../components/CropTable";
import { DemoBadge } from "../components/DemoBadge";
import { HealthDonut } from "../components/HealthDonut";
import { StatCards } from "../components/StatCards";
import { VerificationFunnel } from "../components/VerificationFunnel";
import { fmtDate, fmtHa, fmtPct } from "../lib/format";

interface Crumb {
  level: Level;
  id?: string;
  name: string;
}

const CHILD_LABEL: Record<Level, string> = { state: "District", district: "Taluka", taluka: "Village", village: "Survey" };

export function Dashboard() {
  const navigate = useNavigate();
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ level: "state", name: "Maharashtra" }]);
  const current = crumbs[crumbs.length - 1];
  const path = current.level === "state" ? "/api/dashboard/summary" : `/api/dashboard/summary?level=${current.level}&id=${current.id}`;
  const { data, error, loading } = useApi<DashboardSummary>(path);
  const alerts = useApi<Page<Alert>>("/api/alerts?page_size=8");
  const { data: mapConfig } = useMapConfig();

  const nextLevel: Record<Level, Level | null> = { state: "district", district: "taluka", taluka: "village", village: null };

  const drill = (child: SummaryChild) => {
    if (child.level === "survey") {
      navigate(`/map?survey=${child.id}`);
      return;
    }
    const lvl = nextLevel[current.level];
    if (lvl) setCrumbs([...crumbs, { level: lvl, id: child.id, name: child.name }]);
  };

  const cards = useMemo(() => {
    if (!data) return [];
    const c = data.cards;
    return [
      { label: "Total surveyed area", value: fmtHa(c.total_surveyed_area_ha), hint: "Union of survey areas" },
      { label: "Active surveys", value: String(c.active_surveys), hint: "Draft to processing" },
      { label: "Completed surveys", value: String(c.completed_surveys), hint: "Processed or verified" },
      { label: "Fields analysed", value: String(c.fields_analysed), hint: fmtHa(c.analysed_area_ha) },
      { label: "Healthy", value: fmtPct(c.healthy_pct), hint: "Share of analysed area" },
      { label: "Crop stress", value: fmtPct(c.stress_pct), hint: "Area below moderate NDVI" },
      { label: "Possible damage", value: fmtPct(c.possible_damage_pct), hint: "Area-weighted estimate" },
      { label: "Pending verifications", value: String(c.pending_verifications), hint: "AI only, not field-checked" },
    ];
  }, [data]);

  return (
    <div className={`space-y-5 ${loading && data ? "opacity-60 transition-opacity" : ""}`}>
      {/* Filter row: hierarchy scope for everything below */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Hierarchy" className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={`${c.level}-${c.id ?? "root"}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-400">›</span>}
              <button
                className={i === crumbs.length - 1 ? "font-semibold text-navy" : "text-slate-600 hover:text-navy hover:underline"}
                onClick={() => setCrumbs(crumbs.slice(0, i + 1))}
                disabled={i === crumbs.length - 1}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        {data?.contains_demo && (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            <DemoBadge /> Figures below include seeded demonstration data.
          </div>
        )}
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data && (
        <>
          <StatCards items={cards} demo={data.contains_demo} />

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-navy">Crop distribution</h2>
              <CropTable rows={data.crop_distribution} cropOrder={mapConfig?.crops ?? []} />
            </section>
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-navy">Crop health (share of analysed area)</h2>
              <HealthDonut health={data.health} />
              <p className="mt-3 text-[11px] text-slate-500">Health classes use indicative NDVI thresholds (configurable, not agronomically certified).</p>
            </section>
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-navy">Verification: AI vs field</h2>
              <VerificationFunnel stages={data.verification_funnel} />
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card p-5 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold text-navy">
                {CHILD_LABEL[data.level]}s in {current.name}
              </h2>
              {mapConfig && data.level !== "village" && data.children.some((c) => c.geometry) && (
                <div className="mb-4">
                  <ChoroplethMap config={mapConfig} units={data.children} onSelect={drill} />
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-2 font-semibold">{CHILD_LABEL[data.level]}</th>
                      {data.level === "village" ? (
                        <>
                          <th className="pb-2 font-semibold">Date</th>
                          <th className="pb-2 font-semibold">Status</th>
                        </>
                      ) : (
                        <>
                          <th className="pb-2 text-right font-semibold">Surveys</th>
                          <th className="pb-2 text-right font-semibold">Surveyed</th>
                          <th className="pb-2 text-right font-semibold">Fields</th>
                          <th className="pb-2 text-right font-semibold">Healthy</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.children.map((c) => (
                      <tr key={c.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => drill(c)}>
                        <td className="py-2 font-medium text-navy">
                          {c.name} {(c.is_demo || c.contains_demo) && <DemoBadge label="Demo" className="ml-1" />}
                        </td>
                        {c.level === "survey" ? (
                          <>
                            <td className="py-2">{fmtDate(c.survey_date)}</td>
                            <td className="py-2 capitalize">{c.status}</td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 text-right tabular-nums">{c.surveys}</td>
                            <td className="py-2 text-right tabular-nums">{fmtHa(c.surveyed_area_ha)}</td>
                            <td className="py-2 text-right tabular-nums">{c.fields_analysed}</td>
                            <td className="py-2 text-right tabular-nums">{fmtPct(c.healthy_pct)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.children.length && <p className="py-3 text-sm text-slate-500">Nothing here yet.</p>}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">{data.basis.description}</p>
            </section>
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-semibold text-navy">Alerts</h2>
              <AlertsFeed alerts={alerts.data?.items ?? []} onChange={alerts.reload} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
