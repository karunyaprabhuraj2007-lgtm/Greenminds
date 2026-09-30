import { useEffect, useState } from "react";
import { get } from "../app/api";
import type { AuditEntry, Page } from "../app/types";

export function AuditLog() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 25;

  useEffect(() => {
    get<Page<AuditEntry>>(`/api/audit-log?page=${page}&page_size=${pageSize}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-th">Time</th>
              <th className="table-th">Action</th>
              <th className="table-th">Entity</th>
              <th className="table-th">Entity ID</th>
              <th className="table-th">User</th>
              <th className="table-th">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((a) => (
              <tr key={a.id}>
                <td className="table-td whitespace-nowrap">{new Date(a.at).toLocaleString()}</td>
                <td className="table-td font-medium">{a.action}</td>
                <td className="table-td">{a.entity}</td>
                <td className="table-td font-mono text-xs">{a.entity_id?.slice(0, 8) ?? "-"}</td>
                <td className="table-td font-mono text-xs">{a.user_id?.slice(0, 8) ?? "-"}</td>
                <td className="table-td">{a.ip ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages} ({data?.total ?? 0} entries)</span>
        <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
