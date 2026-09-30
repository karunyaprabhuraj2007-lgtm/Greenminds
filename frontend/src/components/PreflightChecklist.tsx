import { useEffect, useState } from "react";
import { post } from "../app/api";
import type { ChecklistState } from "../app/types";
import { useApi } from "../app/useApi";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-sky-50 text-sky-800",
  authorized: "bg-leaf-50 text-leaf-700",
};

/** SPEC Section 9: checklist + AUTHORIZE MISSION (enabled only when every item is OK and the role allows). */
export function PreflightChecklist({ missionId, onChange }: { missionId: string; onChange?: () => void }) {
  const { data, error, reload } = useApi<ChecklistState>(`/api/missions/${missionId}/preflight`);
  const [draft, setDraft] = useState<Record<string, { ok: boolean; value: string }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.items.map((i) => [i.key, { ok: i.ok, value: i.value ?? "" }])));
  }, [data]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading checklist...</p>;

  const dirty = data.items.some((i) => draft[i.key] && (draft[i.key].ok !== i.ok || (draft[i.key].value || null) !== i.value));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: "ok", text: ok });
      reload();
      onChange?.();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => post(`/api/missions/${missionId}/preflight`, {
        items: data.items.map((i) => ({ item: i.key, ok: draft[i.key]?.ok ?? false, value: draft[i.key]?.value || null })),
      }),
      "Checklist saved",
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[data.status] ?? "bg-slate-100"}`}>
          {data.status}
        </span>
        <span className="text-xs text-slate-500">
          {data.items.filter((i) => i.ok).length} / {data.items.length} items OK
        </span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {data.items.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <label className="flex min-w-[16rem] flex-1 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#2E7D32]"
                checked={draft[item.key]?.ok ?? false}
                onChange={(e) => setDraft({ ...draft, [item.key]: { ...draft[item.key], ok: e.target.checked } })}
              />
              <span>{item.label}</span>
              {item.telemetry && <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">auto from telemetry in Phase 4</span>}
            </label>
            <input
              className="input w-48 py-1 text-xs"
              placeholder="Note / value"
              value={draft[item.key]?.value ?? ""}
              onChange={(e) => setDraft({ ...draft, [item.key]: { ...draft[item.key], value: e.target.value } })}
              aria-label={`${item.label} note`}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary" disabled={busy || !dirty} onClick={save}>Save checklist</button>
        {data.can_authorize ? (
          <button
            className="btn bg-leaf text-white hover:bg-leaf-700"
            disabled={busy || !data.authorize_enabled || dirty}
            title={data.authorize_enabled ? "" : "Every checklist item must be OK (and saved)"}
            onClick={() => run(() => post(`/api/missions/${missionId}/authorize`, {}), "Mission authorized")}
          >
            AUTHORIZE MISSION
          </button>
        ) : (
          <button
            className="btn-primary"
            disabled={busy || data.status !== "ready" || dirty}
            onClick={() => run(() => post(`/api/missions/${missionId}/request-authorization`, {}), "Authorization requested from an officer")}
          >
            Request authorization
          </button>
        )}
        {message && <span className={`text-sm ${message.kind === "ok" ? "text-leaf" : "text-red-700"}`}>{message.text}</span>}
      </div>
      {data.authorized_at && (
        <p className="text-xs text-slate-600">Authorized at {new Date(data.authorized_at).toLocaleString("en-IN")} (audit-logged).</p>
      )}
      <p className="text-[11px] text-slate-500">
        Changing any item to not-OK after authorization revokes the authorization. Check Digital Sky and your RPC conditions before every flight.
      </p>
    </div>
  );
}
