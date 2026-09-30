import { patch } from "../app/api";
import type { Alert } from "../app/types";
import { DemoBadge } from "./DemoBadge";

const SEVERITY: Record<Alert["severity"], { label: string; cls: string }> = {
  info: { label: "Info", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  warning: { label: "Warning", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  critical: { label: "Critical", cls: "bg-red-50 text-red-800 border-red-200" },
};

export function AlertsFeed({ alerts, onChange }: { alerts: Alert[]; onChange: () => void }) {
  if (!alerts.length) return <p className="text-sm text-slate-500">No alerts.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {alerts.map((a) => (
        <li key={a.id} className={`flex items-start gap-3 py-2.5 ${a.read ? "opacity-60" : ""}`}>
          <span className={`mt-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY[a.severity].cls}`}>
            {SEVERITY[a.severity].label}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700">{a.message}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
              {new Date(a.created_at).toLocaleString("en-IN")}
              {a.is_demo && <DemoBadge label="Demo" />}
            </p>
          </div>
          <button
            className="text-xs font-medium text-navy hover:underline"
            onClick={() => patch(`/api/alerts/${a.id}`, { read: !a.read }).then(onChange)}
          >
            {a.read ? "Mark unread" : "Mark read"}
          </button>
        </li>
      ))}
    </ul>
  );
}
