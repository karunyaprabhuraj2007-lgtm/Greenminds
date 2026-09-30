import { Link } from "react-router-dom";
import type { PlotDetail, TimelinePoint } from "../app/types";
import { HEALTH_COLORS, HEALTH_LABELS } from "../lib/colors";
import { fmtDate, fmtHa, fmtNum, fmtPct, titleCase } from "../lib/format";
import { DemoBadge } from "./DemoBadge";
import { TimelineChart } from "./TimelineChart";

const VERIFICATION_LABEL: Record<string, string> = {
  ai_only: "Not field-verified (AI only)",
  verified: "Verifier: confirmed",
  needs_review: "Verifier: needs review",
  rejected: "Verifier: rejected",
  submitted: "Verification submitted",
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}

function HealthChip({ value }: { value: string | null | undefined }) {
  if (!value) return <span>–</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEALTH_COLORS[value] }} aria-hidden />
      {HEALTH_LABELS[value] ?? value}
    </span>
  );
}

export function PlotPanel({ plot, timeline, onClose }: { plot: PlotDetail; timeline: TimelinePoint[]; onClose: () => void }) {
  const ai = plot.ai_result;
  const v = plot.verification;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-navy">Plot {plot.plot_code}</h2>
            {plot.is_demo && <DemoBadge />}
          </div>
          <p className="text-xs text-slate-500">
            {plot.village_name ?? "–"} · {fmtDate(plot.survey.survey_date)}
          </p>
          {plot.is_candidate && (
            <p className="mt-1 text-[11px] font-medium text-amber-700">Candidate plot — needs officer confirmation</p>
          )}
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close plot panel">✕</button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Area" value={fmtHa(plot.area_ha, 2)} />
          <Stat label="Parcel ref" value={plot.parcel_ref ?? "–"} />
        </dl>

        <section className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">AI result</h3>
            <span className="text-[10px] text-slate-400">decision support · {ai?.model_version ?? "no model"}</span>
          </div>
          {ai ? (
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Crop (AI)" value={`${titleCase(ai.crop_pred)}${ai.crop_confidence != null ? ` · ${Math.round(ai.crop_confidence * 100)}% conf.` : ""}`} />
              <Stat label="Health" value={<HealthChip value={ai.health_class} />} />
              <Stat label="NDVI mean" value={fmtNum(ai.ndvi_mean)} />
              <Stat label="NDVI p10 / p90" value={`${fmtNum(ai.ndvi_p10)} / ${fmtNum(ai.ndvi_p90)}`} />
              <Stat label="Stress" value={fmtPct(ai.stress_pct)} />
              <Stat label="Damage" value={fmtPct(ai.damage_pct)} />
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Not analysed yet.</p>
          )}
          {ai?.is_demo && <p className="mt-2 text-[10px] text-amber-700">Synthetic demo values, not a model output.</p>}
        </section>

        <section className="rounded-md border border-slate-200 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Field verification</h3>
          <p className="text-sm text-slate-700">{VERIFICATION_LABEL[v.status] ?? v.status}</p>
          {v.latest && (
            <dl className="mt-2 grid grid-cols-2 gap-3">
              <Stat label="Actual crop" value={titleCase(v.latest.actual_crop)} />
              <Stat label="Health (field)" value={<HealthChip value={v.latest.health_class} />} />
              <Stat label="Verified" value={v.latest.verified_at ? new Date(v.latest.verified_at).toLocaleDateString("en-IN") : "–"} />
              <Stat label="Photos" value={v.latest.photo_count} />
            </dl>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">NDVI timeline</h3>
          <TimelineChart points={timeline} currentSurveyId={plot.survey.id} />
          {timeline.length > 1 && (
            <p className="text-[10px] text-slate-400">One point per dated survey. Compare dates only if imagery is calibrated.</p>
          )}
        </section>
      </div>

      <div className="flex gap-2 border-t border-slate-200 px-4 py-3">
        <Link to={`/verification?plot=${plot.id}`} className="btn-primary flex-1 text-xs">Open verification</Link>
        <button className="btn-secondary flex-1 text-xs" disabled title="Before/after comparison arrives in Phase 8">
          Compare surveys
        </button>
      </div>
    </div>
  );
}
