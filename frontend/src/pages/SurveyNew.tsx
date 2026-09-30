import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, get, post } from "../app/api";
import { usePage } from "../app/page";
import type { AdminUnit, InputAoi, Page, SurveyWrite } from "../app/types";
import { useApi } from "../app/useApi";
import { useMapConfig } from "../app/useMapConfig";
import { AoiDrawMap } from "../components/AoiDrawMap";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { fmtHa } from "../lib/format";
import { formatArea, formatDistance, pathLengthM, polygonAreaM2, type LngLat } from "../lib/measure";

const TYPES = [
  ["crop_survey", "Crop survey"], ["crop_health", "Crop health"], ["damage_assessment", "Damage assessment"],
  ["insurance_verification", "Insurance verification"], ["subsidy_verification", "Subsidy verification"],
] as const;
const STEPS = ["Details", "Area of interest", "Review"];

function ringFromGeoJson(data: unknown): LngLat[] | null {
  const g = data as { type?: string; features?: { geometry: unknown }[]; geometry?: unknown; coordinates?: number[][][] | number[][][][] };
  if (g?.type === "FeatureCollection") return ringFromGeoJson(g.features?.[0]?.geometry);
  if (g?.type === "Feature") return ringFromGeoJson(g.geometry);
  if (g?.type === "Polygon") return (g.coordinates as number[][][])[0].slice(0, -1).map((p) => [p[0], p[1]]);
  if (g?.type === "MultiPolygon") return (g.coordinates as number[][][][])[0][0].slice(0, -1).map((p) => [p[0], p[1]]);
  return null;
}

export default function SurveyNew() {
  usePage("New survey", [{ label: "Surveys", to: "/surveys" }, { label: "New survey" }]);
  const navigate = useNavigate();
  const toast = useToast();
  const { data: config } = useMapConfig();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", type: "crop_survey", district_id: "", taluka_id: "", survey_date: new Date().toISOString().slice(0, 10), season: "", notes: "" });
  const [touched, setTouched] = useState(false);
  const [vertices, setVertices] = useState<LngLat[]>([]);
  const [drawing, setDrawing] = useState(true);
  const [aoiSource, setAoiSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputs, setInputs] = useState<InputAoi[]>([]);
  const file = useRef<HTMLInputElement>(null);

  const districts = useApi<Page<AdminUnit>>("/api/admin-units/districts?page_size=100");
  const talukas = useApi<Page<AdminUnit>>(form.district_id ? `/api/admin-units/talukas?district_id=${form.district_id}&page_size=200&geometry=true` : null);
  const taluka = talukas.data?.items.find((t) => t.id === form.taluka_id);

  useEffect(() => { get<InputAoi[]>("/api/demo/aois").then(setInputs).catch(() => setInputs([])); }, []);
  useEffect(() => {
    const items = districts.data?.items;
    if (items?.length === 1 && !form.district_id) setForm((f) => ({ ...f, district_id: items[0].id }));
  }, [districts.data, form.district_id]);

  const areaM2 = useMemo(() => (vertices.length >= 3 ? polygonAreaM2(vertices) : 0), [vertices]);
  const perimeter = useMemo(() => (vertices.length >= 2 ? pathLengthM([...vertices, vertices[0]]) : 0), [vertices]);
  const errors = { name: !form.name.trim() ? "Give the survey a name" : null, district: !form.district_id ? "Select a district" : null };
  const aoiValid = vertices.length >= 3 && !drawing;
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const applyRing = (ring: LngLat[], source: string) => { setVertices(ring); setDrawing(false); setAoiSource(source); };
  const onFile = async (f: File) => {
    try {
      const ring = ringFromGeoJson(JSON.parse(await f.text()));
      if (!ring || ring.length < 3) throw new Error("No polygon in file");
      applyRing(ring, f.name);
    } catch (e) {
      toast({ tone: "error", title: "Could not read the file", body: `${(e as Error).message}. Use a GeoJSON polygon (KML / shapefile plots can be imported on the survey page).` });
    }
    if (file.current) file.current.value = "";
  };

  const create = async () => {
    setBusy(true);
    try {
      const s = await post<SurveyWrite>("/api/surveys", {
        ...form, taluka_id: form.taluka_id || null, season: form.season || null, notes: form.notes || null,
        aoi: { type: "Polygon", coordinates: [[...vertices, vertices[0]]] },
      });
      toast({ tone: "success", title: "Survey created", body: `${s.name} · ${fmtHa(s.aoi_area_ha, 2)}` });
      navigate(`/surveys/${s.id}`, { state: { warnings: s.warnings } });
    } catch (e) {
      toast({ tone: "error", title: "Could not create survey", body: e instanceof ApiError ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const district = districts.data?.items.find((d) => d.id === form.district_id);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New survey</h1>
        <ol className="mt-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-8 bg-slate-300" aria-hidden />}
              <span aria-current={i === step ? "step" : undefined} className={`flex items-center gap-2 rounded-full px-3 py-1 ${i === step ? "bg-navy text-white" : i < step ? "bg-accent-50 text-accent-800" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>
                <span className="num flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">{i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}</span>
                {label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <Card className="max-w-3xl">
          <CardHeader title="Survey details" subtitle="Where and when the survey takes place" />
          <CardBody>
            <form className="grid gap-5 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!errors.name && !errors.district) setStep(1); }}>
              <div className="sm:col-span-2">
                <Field id="s-name" label="Survey name" required error={touched ? errors.name : null}>
                  <input id="s-name" className={`input ${touched && errors.name ? "input-error" : ""}`} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Baramati Rabi crop health" aria-invalid={touched && !!errors.name} />
                </Field>
              </div>
              <Field id="s-type" label="Survey type">
                <select id="s-type" className="input" value={form.type} onChange={(e) => set({ type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </Field>
              <Field id="s-date" label="Survey date"><input id="s-date" type="date" className="input" value={form.survey_date} onChange={(e) => set({ survey_date: e.target.value })} /></Field>
              <Field id="s-district" label="District" required error={touched ? errors.district : null}>
                <select id="s-district" className={`input ${touched && errors.district ? "input-error" : ""}`} value={form.district_id} onChange={(e) => set({ district_id: e.target.value, taluka_id: "" })}>
                  <option value="">Select district…</option>
                  {districts.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field id="s-taluka" label="Taluka" hint="geoBoundaries sub-district">
                <select id="s-taluka" className="input" value={form.taluka_id} disabled={!form.district_id} onChange={(e) => set({ taluka_id: e.target.value })}>
                  <option value="">Select taluka…</option>
                  {talukas.data?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field id="s-season" label="Season"><input id="s-season" className="input" value={form.season} onChange={(e) => set({ season: e.target.value })} placeholder="e.g. Rabi 2026" /></Field>
              <div className="sm:col-span-2"><Field id="s-notes" label="Notes"><textarea id="s-notes" className="input" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></Field></div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" onClick={() => navigate("/surveys")}>Cancel</Button>
                <Button type="submit" variant="primary" icon="chevronRight">Next: area of interest</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {step === 1 && config && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="h-[34rem] overflow-hidden">
            <AoiDrawMap config={config} vertices={vertices} drawing={drawing} context={taluka?.geometry ?? null}
              onAdd={(p) => setVertices((v) => [...v, p])} attribution={config.boundaries.attribution ? [config.boundaries.attribution] : []} />
          </Card>
          <Card>
            <CardBody className="space-y-5">
              <div>
                <p className="eyebrow">Area</p>
                <p className="num mt-1 text-3xl font-semibold tracking-tight text-navy">{areaM2 ? formatArea(areaM2) : "—"}</p>
                <p className="num mt-1 text-xs text-slate-500">{vertices.length} vertices · perimeter {perimeter ? formatDistance(perimeter) : "—"}</p>
                {aoiSource && <p className="mt-1 text-xs text-slate-500">From {aoiSource}</p>}
              </div>
              <div>
                <p className="text-sm text-slate-600">{drawing ? "Click the map to add the corners of the field, then Finish." : "Area ready."}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {drawing ? <Button size="sm" variant="primary" icon="check" disabled={vertices.length < 3} onClick={() => setDrawing(false)}>Finish</Button>
                    : <Button size="sm" icon="pencil" onClick={() => setDrawing(true)}>Add points</Button>}
                  <Button size="sm" disabled={!vertices.length} onClick={() => { setVertices((v) => v.slice(0, -1)); setDrawing(true); }}>Undo</Button>
                  <Button size="sm" variant="ghost" disabled={!vertices.length} onClick={() => { setVertices([]); setDrawing(true); setAoiSource(null); }}>Clear</Button>
                </div>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="eyebrow">Or use an existing polygon</p>
                {inputs.filter((i) => i.geometry).map((i) => (
                  <button key={i.source} onClick={() => applyRing(i.geometry!.coordinates[0].slice(0, -1).map((p) => [p[0], p[1]] as LngLat), `inputs/${i.source}`)}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-navy-200 hover:bg-navy-50">
                    <Icon name="file" className="h-4 w-4 text-slate-400" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.source}</span><span className="num block text-xs text-slate-500">{fmtHa(i.area_ha, 2)} · inputs/</span></span>
                  </button>
                ))}
                {!inputs.some((i) => i.geometry) && <p className="text-xs text-slate-500">No field polygons in the <code>inputs/</code> folder.</p>}
                <input ref={file} type="file" accept=".geojson,.json" className="hidden" aria-label="AOI GeoJSON file" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                <Button size="sm" icon="upload" className="w-full" onClick={() => file.current?.click()}>Load GeoJSON file</Button>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-4">
                <Button onClick={() => setStep(0)}>Back</Button>
                <Button variant="primary" disabled={!aoiValid} onClick={() => setStep(2)}>Review</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {step === 2 && (
        <Card className="max-w-3xl">
          <CardHeader title="Review" subtitle="The survey is saved as a draft. Plots, Sentinel-2 and weather are added on the survey page." />
          <CardBody>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="eyebrow">Name</dt><dd className="mt-1 font-medium">{form.name}</dd></div>
              <div><dt className="eyebrow">Type</dt><dd className="mt-1">{TYPES.find(([v]) => v === form.type)?.[1]}</dd></div>
              <div><dt className="eyebrow">District / taluka</dt><dd className="mt-1">{[district?.name, taluka?.name].filter(Boolean).join(" / ")}</dd></div>
              <div><dt className="eyebrow">Date / season</dt><dd className="mt-1">{form.survey_date} {form.season && `· ${form.season}`}</dd></div>
              <div><dt className="eyebrow">Area (estimate)</dt><dd className="num mt-1 font-medium">{formatArea(areaM2)}</dd></div>
              <div><dt className="eyebrow">Area source</dt><dd className="mt-1">{aoiSource ?? "Drawn on the map"}</dd></div>
            </dl>
            <div className="mt-6 flex justify-between border-t border-slate-100 pt-4">
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" icon="check" loading={busy} onClick={create}>Create survey</Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
