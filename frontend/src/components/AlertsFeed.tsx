import { patch } from "../app/api";
import type { Alert } from "../app/types";
import { Chip } from "./ui/Chip";
import { EmptyState } from "./ui/EmptyState";

const TONE = { info: "info", warning: "warning", critical: "danger" } as const;

export function AlertsFeed({ alerts, onChange }: { alerts: Alert[]; onChange: () => void }) {
  if (!alerts.length) return <EmptyState compact icon="info" title="No alerts" body="Alerts appear when authorizations are requested or processing finishes." />;
  return (
    <ul className="divide-y divide-slate-100">
      {alerts.map((a) => (
        <li key={a.id} className={`flex items-start gap-3 py-3 ${a.read ? "opacity-60" : ""}`}>
          <Chip tone={TONE[a.severity]}>{a.severity}</Chip>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800">{a.message}</p>
            <p className="num mt-0.5 text-2xs text-slate-500">{new Date(a.created_at).toLocaleString("en-IN")}</p>
          </div>
          <button className="text-xs font-medium text-navy-600 hover:underline" onClick={() => patch(`/api/alerts/${a.id}`, { read: !a.read }).then(onChange)}>
            {a.read ? "Mark unread" : "Mark read"}
          </button>
        </li>
      ))}
    </ul>
  );
}
