import { useState } from "react";
import { usePage } from "../app/page";
import type { AuditEntry, Page } from "../app/types";
import { useApi } from "../app/useApi";
import { Chip } from "../components/ui/Chip";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Dialog } from "../components/ui/Dialog";
import { SkeletonCard } from "../components/ui/Skeleton";

export default function AuditLog() {
  usePage("Audit log", [{ label: "Administration" }, { label: "Audit log" }]);
  const { data } = useApi<Page<AuditEntry>>("/api/audit-log?page_size=500");
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const columns: Column<AuditEntry>[] = [
    { key: "at", header: "Time", value: (a) => a.at, render: (a) => <span className="num whitespace-nowrap">{new Date(a.at).toLocaleString("en-IN")}</span> },
    { key: "action", header: "Action", value: (a) => a.action, render: (a) => <Chip tone={a.action.includes("fail") ? "danger" : a.action === "login" ? "neutral" : "brand"}>{a.action}</Chip> },
    { key: "entity", header: "Entity", value: (a) => a.entity, render: (a) => a.entity },
    { key: "entity_id", header: "Entity ID", value: (a) => a.entity_id ?? "", render: (a) => <span className="font-mono text-2xs text-slate-500">{a.entity_id?.slice(0, 8) ?? "–"}</span> },
    { key: "user", header: "User", value: (a) => a.user_id ?? "", render: (a) => <span className="font-mono text-2xs text-slate-500">{a.user_id?.slice(0, 8) ?? "–"}</span> },
    { key: "ip", header: "IP", value: (a) => a.ip ?? "", render: (a) => <span className="num">{a.ip ?? "–"}</span> },
  ];
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-6">
      <div><h1 className="text-xl font-semibold tracking-tight">Audit log</h1><p className="mt-1 text-sm text-slate-500">Every change and sign-in, newest first (latest 500 entries). Select a row for the before/after record.</p></div>
      {!data ? <SkeletonCard lines={8} /> : (
        <DataTable rows={data.items} columns={columns} rowKey={(a) => a.id} onRowClick={setDetail} pageSize={50} filterPlaceholder="Filter by action, entity, IP…" />
      )}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.action} · ${detail.entity}` : ""} width="max-w-2xl"
        description={detail && new Date(detail.at).toLocaleString("en-IN")}>
        {detail && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["before_json", "after_json"] as const).map((k) => (
              <div key={k}><p className="eyebrow mb-1">{k === "before_json" ? "Before" : "After"}</p>
                <pre className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-2xs text-slate-700">{detail[k] ? JSON.stringify(detail[k], null, 2) : "—"}</pre></div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
