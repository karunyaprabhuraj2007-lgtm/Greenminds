import { useEffect, useState } from "react";
import { get } from "../app/api";
import { useAuth } from "../app/auth";
import { ROLE_LABELS } from "../app/types";

interface Health {
  status: string;
  postgis: string;
  demo_mode: boolean;
  telemetry_mode: string;
}

export function Settings() {
  const { user } = useAuth();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    get<Health>("/api/health").then(setHealth).catch(() => setHealth(null));
  }, []);

  if (!user) return null;
  return (
    <div className="grid max-w-4xl gap-6 md:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-navy">Your account</h2>
        <dl className="space-y-2 text-sm">
          <div><dt className="label">Name</dt><dd>{user.name}</dd></div>
          <div><dt className="label">Email</dt><dd>{user.email}</dd></div>
          <div><dt className="label">Role</dt><dd>{ROLE_LABELS[user.role]}</dd></div>
          <div>
            <dt className="label">Permissions</dt>
            <dd className="flex flex-wrap gap-1">
              {user.capabilities.map((c) => (
                <span key={c} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c.replace(/_/g, " ")}</span>
              ))}
            </dd>
          </div>
        </dl>
      </section>
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-navy">System status</h2>
        {health ? (
          <dl className="space-y-2 text-sm">
            <div><dt className="label">API</dt><dd className="text-leaf">{health.status}</dd></div>
            <div><dt className="label">PostGIS</dt><dd>{health.postgis}</dd></div>
            <div><dt className="label">Demo mode</dt><dd>{health.demo_mode ? "On (seeded demo data present)" : "Off"}</dd></div>
            <div><dt className="label">Telemetry mode</dt><dd>{health.telemetry_mode}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-red-600">API not reachable.</p>
        )}
      </section>
    </div>
  );
}
