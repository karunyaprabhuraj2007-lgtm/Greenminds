import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, get, post } from "../app/api";
import type { AdminUnit, DefaultAoi, Page, SurveyWrite } from "../app/types";
import { useApi } from "../app/useApi";
import { useMapConfig } from "../app/useMapConfig";
import { AoiDrawMap } from "../components/AoiDrawMap";
import { formatArea, formatDistance, pathLengthM, polygonAreaM2, type LngLat } from "../lib/measure";

const TYPES = [
  ["crop_survey", "Crop survey"],
  ["crop_health", "Crop health"],
  ["damage_assessment", "Damage assessment"],
  ["insurance_verification", "Insurance verification"],
  ["subsidy_verification", "Subsidy verification"],
] as const;

const STEPS = ["Details", "Area of interest", "Mission parameters", "Create & download"];

export function SurveyNew() {
  const navigate = useNavigate();
  const { data: config } = useMapConfig();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "", type: "crop_survey", district_id: "", taluka_id: "", village_id: "",
    survey_date: new Date().toISOString().slice(0, 10), season: "", notes: "",
  });
  const [vertices, setVertices] = useState<LngLat[]>([]);
  const [drawing, setDrawing] = useState(true);
  const [aoiSource, setAoiSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const districts = useApi<Page<AdminUnit>>("/api/admin-units/districts");
  const talukas = useApi<Page<AdminUnit>>(form.district_id ? `/api/admin-units/talukas?district_id=${form.district_id}` : null);
  const villages = useApi<Page<AdminUnit>>(form.taluka_id ? `/api/admin-units/villages?taluka_id=${form.taluka_id}` : null);
  const [defaultAoi, setDefaultAoi] = useState<DefaultAoi | null>(null);

  useEffect(() => {
    get<DefaultAoi>("/api/demo/default-aoi").then(setDefaultAoi).catch(() => setDefaultAoi(null));
  }, []);
  useEffect(() => {
    // Single-district users (officers) get their district preselected.
    const items = districts.data?.items;
    if (items?.length === 1 && !form.district_id) setForm((f) => ({ ...f, district_id: items[0].id }));
  }, [districts.data, form.district_id]);

  const areaM2 = useMemo(() => (vertices.length >= 3 ? polygonAreaM2(vertices) : 0), [vertices]);
  const perimeter = useMemo(() => (vertices.length >= 2 ? pathLengthM([...vertices, vertices[0]]) : 0), [vertices]);
  const detailsValid = form.name.trim() && form.district_id;
  const aoiValid = vertices.length >= 3 && !drawing;

  const loadDefault = () => {
    if (!defaultAoi) return;
    const ring = defaultAoi.geometry.coordinates[0].map((p) => [p[0], p[1]] as LngLat);
    setVertices(ring.slice(0, -1));
    setDrawing(false);
    setAoiSource(defaultAoi.source);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...form,
        taluka_id: form.taluka_id || null,
        village_id: form.village_id || null,
        season: form.season || null,
        notes: form.notes || null,
        aoi: { type: "Polygon", coordinates: [[...vertices, vertices[0]]] },
      };
      const s = await post<SurveyWrite>("/api/surveys", body);
      navigate(`/surveys/${s.id}`, { state: { warnings: s.warnings } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create survey");
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
            i === step ? "border-navy bg-navy text-white" : i < step ? "border-leaf-100 bg-leaf-50 text-leaf-700" : "border-slate-200 bg-white text-slate-500"}`}>
            <span className="font-semibold">{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {step === 0 && (
        <div className="card grid max-w-3xl gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="s-name">Survey name</label>
            <input id="s-name" className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Malegaon Rabi crop health" />
          </div>
          <div>
            <label className="label" htmlFor="s-type">Survey type</label>
            <select id="s-type" className="input" value={form.type} onChange={(e) => set({ type: e.target.value })}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-date">Survey date</label>
            <input id="s-date" type="date" className="input" value={form.survey_date} onChange={(e) => set({ survey_date: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="s-district">District</label>
            <select id="s-district" className="input" value={form.district_id} onChange={(e) => set({ district_id: e.target.value, taluka_id: "", village_id: "" })}>
              <option value="">Select...</option>
              {districts.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-taluka">Taluka</label>
            <select id="s-taluka" className="input" value={form.taluka_id} disabled={!form.district_id} onChange={(e) => set({ taluka_id: e.target.value, village_id: "" })}>
              <option value="">Select...</option>
              {talukas.data?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-village">Village</label>
            <select id="s-village" className="input" value={form.village_id} disabled={!form.taluka_id} onChange={(e) => set({ village_id: e.target.value })}>
              <option value="">Select...</option>
              {villages.data?.items.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-season">Season</label>
            <input id="s-season" className="input" value={form.season} onChange={(e) => set({ season: e.target.value })} placeholder="e.g. Rabi 2026" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="s-notes">Notes</label>
            <textarea id="s-notes" className="input" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button className="btn-primary" disabled={!detailsValid} onClick={() => setStep(1)}>Next: draw area</button>
          </div>
        </div>
      )}

      {step === 1 && config && (
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div className="card h-[32rem] overflow-hidden">
            <AoiDrawMap config={config} vertices={vertices} drawing={drawing} onAdd={(p) => setVertices((v) => [...v, p])} />
          </div>
          <div className="card space-y-4 p-4">
            <div>
              <div className="label">Area</div>
              <div className="text-3xl font-semibold text-navy">{areaM2 ? formatArea(areaM2) : "–"}</div>
              <div className="text-xs text-slate-500">
                {vertices.length} vertices · perimeter {perimeter ? formatDistance(perimeter) : "–"}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Live estimate; the server stores the geodesic area.</p>
            </div>
            <p className="text-sm text-slate-600">
              {drawing ? "Click on the map to add corners of the field, then press Finish." : "Area ready."}
              {aoiSource && <span className="block text-xs text-slate-500">Loaded from inputs/{aoiSource}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {drawing ? (
                <button className="btn-primary" disabled={vertices.length < 3} onClick={() => setDrawing(false)}>Finish</button>
              ) : (
                <button className="btn-secondary" onClick={() => setDrawing(true)}>Add more points</button>
              )}
              <button className="btn-secondary" disabled={!vertices.length} onClick={() => { setVertices((v) => v.slice(0, -1)); setDrawing(true); }}>Undo</button>
              <button className="btn-secondary" disabled={!vertices.length} onClick={() => { setVertices([]); setDrawing(true); setAoiSource(null); }}>Clear</button>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <button className="btn-secondary w-full" disabled={!defaultAoi} onClick={loadDefault}>
                Use demo field polygon
              </button>
              <p className="mt-1 text-[11px] text-slate-500">
                {defaultAoi ? `inputs/${defaultAoi.source} · ${defaultAoi.area_ha.toFixed(2)} ha` : "No polygon found in the inputs/ folder."}
              </p>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-3">
              <button className="btn-secondary" onClick={() => setStep(0)}>Back</button>
              <button className="btn-primary" disabled={!aoiValid} onClick={() => setStep(2)}>Next</button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card max-w-3xl space-y-4 p-5">
          <h2 className="text-sm font-semibold text-navy">Mission parameters</h2>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            The flight planner (camera profile, altitude, overlaps, speed, live GSD / image / flight
            estimates and flight-line preview) comes from the tested <code>greenminds_core_modules</code>
            package, which is not in the repository yet. Save the survey as a draft now; missions are
            planned from the survey page once the module is integrated.
          </div>
          <div className="flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary" disabled={busy || !aoiValid || !detailsValid} onClick={create}>
              {busy ? "Saving..." : "Save survey as draft"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
