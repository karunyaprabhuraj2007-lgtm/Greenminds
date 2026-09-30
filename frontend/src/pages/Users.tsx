import { useEffect, useState, type FormEvent } from "react";
import { get, patch, post } from "../app/api";
import { ROLE_LABELS, type AdminUnit, type Page, type Role, type User } from "../app/types";
import { DemoBadge } from "../components/DemoBadge";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [districts, setDistricts] = useState<AdminUnit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "drone_operator" as Role, district_id: "" });

  const load = () =>
    get<Page<User>>("/api/users?page_size=200").then((p) => setUsers(p.items)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    get<Page<AdminUnit>>("/api/admin-units/districts").then((p) => setDistricts(p.items)).catch(() => {});
  }, []);

  const districtName = (id: string | null) => districts.find((d) => d.id === id)?.name ?? "-";

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await post<User>("/api/users", { ...form, district_id: form.district_id || null });
      setForm({ name: "", email: "", password: "", role: "drone_operator", district_id: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create user");
    }
  }

  async function toggleActive(u: User) {
    setError(null);
    try {
      await patch<User>(`/api/users/${u.id}`, { active: !u.active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-th">Name</th>
              <th className="table-th">Email</th>
              <th className="table-th">Role</th>
              <th className="table-th">District</th>
              <th className="table-th">Status</th>
              <th className="table-th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="table-td font-medium">
                  {u.name} {u.is_demo && <DemoBadge label="Demo" className="ml-1" />}
                </td>
                <td className="table-td">{u.email}</td>
                <td className="table-td">{ROLE_LABELS[u.role]}</td>
                <td className="table-td">{districtName(u.district_id)}</td>
                <td className="table-td">
                  <span className={u.active ? "text-leaf" : "text-slate-400"}>{u.active ? "Active" : "Inactive"}</span>
                </td>
                <td className="table-td text-right">
                  <button className="text-xs font-medium text-navy hover:underline" onClick={() => toggleActive(u)}>
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={create} className="card grid max-w-3xl gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-navy sm:col-span-2">Add user</h2>
        <div>
          <label className="label" htmlFor="u-name">Name</label>
          <input id="u-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="u-email">Email</label>
          <input id="u-email" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="u-pass">Initial password (min 8)</label>
          <input id="u-pass" type="password" minLength={8} className="input" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="u-role">Role</label>
          <select id="u-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="u-district">District {form.role === "district_officer" && "(required)"}</label>
          <select id="u-district" className="input" value={form.district_id} onChange={(e) => setForm({ ...form, district_id: e.target.value })}>
            <option value="">-</option>
            {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary">Create user</button>
        </div>
      </form>
    </div>
  );
}
