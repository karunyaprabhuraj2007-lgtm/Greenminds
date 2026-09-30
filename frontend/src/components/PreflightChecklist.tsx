import { useEffect, useState } from "react";
import { post } from "../app/api";
import type { ChecklistState } from "../app/types";
import { useApi } from "../app/useApi";
import { Button } from "./ui/Button";
import { StatusChip } from "./ui/Chip";
import { SkeletonCard } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";

/** SPEC Section 9: checklist + AUTHORIZE MISSION (enabled only when every item is OK and the role allows). */
export function PreflightChecklist({ missionId, onChange }: { missionId: string; onChange?: () => void }) {
  const toast = useToast();
  const { data, error, reload } = useApi<ChecklistState>(`/api/missions/${missionId}/preflight`);
  const [draft, setDraft] = useState<Record<string, { ok: boolean; value: string }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.items.map((i) => [i.key, { ok: i.ok, value: i.value ?? "" }])));
  }, [data]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data) return <SkeletonCard lines={5} />;

  const dirty = data.items.some((i) => draft[i.key] && (draft[i.key].ok !== i.ok || (draft[i.key].value || null) !== i.value));
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ tone: "success", title: ok });
      reload();
      onChange?.();
    } catch (e) {
      toast({ tone: "error", title: "Action failed", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(() => post(`/api/missions/${missionId}/preflight`, {
    items: data.items.map((i) => ({ item: i.key, ok: draft[i.key]?.ok ?? false, value: draft[i.key]?.value || null })),
  }), "Checklist saved");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatusChip status={data.status} />
        <span className="num text-xs text-slate-500">{data.items.filter((i) => i.ok).length} / {data.items.length} items OK</span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {data.items.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <label className="flex min-w-[16rem] flex-1 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded accent-[#2E7D32]" checked={draft[item.key]?.ok ?? false}
                onChange={(e) => setDraft({ ...draft, [item.key]: { ...draft[item.key], ok: e.target.checked } })} />
              <span className="text-slate-800">{item.label}</span>
            </label>
            <input className="input h-8 w-56 text-xs" placeholder="Note / reading" value={draft[item.key]?.value ?? ""}
              onChange={(e) => setDraft({ ...draft, [item.key]: { ...draft[item.key], value: e.target.value } })} aria-label={`${item.label} note`} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!dirty} loading={busy && dirty} onClick={save}>Save checklist</Button>
        {data.can_authorize ? (
          <Button variant="accent" icon="shield" disabled={busy || !data.authorize_enabled || dirty}
            title={data.authorize_enabled ? undefined : "Every checklist item must be OK and saved"}
            onClick={() => run(() => post(`/api/missions/${missionId}/authorize`, {}), "Mission authorized")}>
            Authorize mission
          </Button>
        ) : (
          <Button variant="primary" disabled={busy || data.status !== "ready" || dirty}
            onClick={() => run(() => post(`/api/missions/${missionId}/request-authorization`, {}), "Authorization requested from an officer")}>
            Request authorization
          </Button>
        )}
      </div>
      {data.authorized_at && <p className="text-xs text-slate-600">Authorized {new Date(data.authorized_at).toLocaleString("en-IN")} · audit-logged.</p>}
      <p className="text-2xs text-slate-500">Marking any item not-OK after authorization revokes it. Check Digital Sky and your RPC conditions before every flight.</p>
    </div>
  );
}
