import { Link, useLocation, useParams } from "react-router-dom";
import type { Mission, Survey } from "../app/types";
import { useApi } from "../app/useApi";
import { DemoBadge } from "../components/DemoBadge";
import { PreflightChecklist } from "../components/PreflightChecklist";
import { fmtDate, fmtHa, titleCase } from "../lib/format";

export function SurveyDetail() {
  const { id } = useParams();
  const location = useLocation();
  const warnings = (location.state as { warnings?: string[] } | null)?.warnings ?? [];
  const survey = useApi<Survey>(`/api/surveys/${id}`);
  const missions = useApi<Mission[]>(`/api/surveys/${id}/missions`);
  const s = survey.data;

  if (survey.error) return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{survey.error}</p>;
  if (!s) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="max-w-5xl space-y-4">
      {warnings.map((w) => (
        <p key={w} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>
      ))}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
              {s.name} {s.is_demo && <DemoBadge />}
            </h2>
            <p className="text-sm text-slate-500">
              {titleCase(s.type)} · {fmtDate(s.survey_date)} · {[s.village_name, s.taluka_name, s.district_name].filter(Boolean).join(", ")}
            </p>
          </div>
          <div className="flex gap-2">
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold uppercase text-slate-700">{s.status}</span>
            <Link to={`/map?survey=${s.id}`} className="btn-secondary">Open on map</Link>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt className="label">AOI area</dt><dd className="font-medium">{fmtHa(s.aoi_area_ha, 2)}</dd></div>
          <div><dt className="label">Season</dt><dd>{s.season ?? "–"}</dd></div>
          <div><dt className="label">Plots</dt><dd>{s.plot_count}</dd></div>
          <div><dt className="label">Created</dt><dd>{new Date(s.created_at).toLocaleDateString("en-IN")}</dd></div>
        </dl>
        {s.notes && <p className="mt-3 text-sm text-slate-600">{s.notes}</p>}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-navy">Missions</h2>
        {!missions.data?.length && (
          <p className="text-sm text-slate-500">
            No missions yet. Mission planning (GSD, images, flights, QGC / Mission Planner export) is added
            with the flight-planner module.
          </p>
        )}
        <div className="space-y-6">
          {missions.data?.map((m, i) => (
            <div key={m.id} className="space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="font-semibold text-navy">Mission {i + 1}</span>
                <span>{m.camera_profile}</span>
                <span>{m.altitude_m} m AGL</span>
                <span>overlap {Math.round(m.front_overlap * 100)}/{Math.round(m.side_overlap * 100)}%</span>
                {m.gsd_cm != null && <span>GSD {m.gsd_cm.toFixed(2)} cm/px</span>}
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pre-flight checklist</h3>
              <PreflightChecklist missionId={m.id} onChange={missions.reload} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
