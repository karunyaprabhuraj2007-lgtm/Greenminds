import { useState } from "react";
import { patch, post } from "../app/api";
import { useAuth } from "../app/auth";
import { usePage } from "../app/page";
import { ROLE_LABELS, type AdminUnit, type Page, type Role, type User } from "../app/types";
import { useApi } from "../app/useApi";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { useConfirm } from "../components/ui/Confirm";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Dialog } from "../components/ui/Dialog";
import { Field } from "../components/ui/Field";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";

const ROLES = Object.keys(ROLE_LABELS) as Role[];
const EMPTY_FORM = { name: "", email: "", password: "", role: "drone_operator" as Role, district_id: "" };

export default function Users() {
  usePage("Users", [{ label: "Administration" }, { label: "Users" }]);
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const users = useApi<Page<User>>("/api/users?page_size=500");
  const districts = useApi<Page<AdminUnit>>("/api/admin-units/districts?page_size=100");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const districtName = (id: string | null) => districts.data?.items.find((d) => d.id === id)?.name ?? "–";

  const errors = {
    name: !form.name.trim() ? "Required" : null,
    email: !/^\S+@\S+\.\S+$/.test(form.email) ? "Enter a valid email" : null,
    password: form.password.length < 8 ? "At least 8 characters" : null,
    district: form.role === "district_officer" && !form.district_id ? "District officers need a district" : null,
  };
  const valid = !Object.values(errors).some(Boolean);

  const create = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    try {
      await post<User>("/api/users", { ...form, district_id: form.district_id || null });
      toast({ tone: "success", title: "User created", body: form.email });
      setOpen(false);
      setForm(EMPTY_FORM);
      setTouched(false);
      users.reload();
    } catch (e) {
      toast({ tone: "error", title: "Could not create user", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (u: User) => {
    if (u.active && !(await confirm({ title: `Deactivate ${u.name}?`, body: "They will be signed out and cannot sign in until reactivated.", confirmLabel: "Deactivate", danger: true }))) return;
    try {
      await patch(`/api/users/${u.id}`, { active: !u.active });
      toast({ tone: "success", title: u.active ? "User deactivated" : "User activated" });
      users.reload();
    } catch (e) {
      toast({ tone: "error", title: "Update failed", body: (e as Error).message });
    }
  };

  const columns: Column<User>[] = [
    { key: "name", header: "Name", value: (u) => u.name, render: (u) => <span className="font-medium text-navy">{u.name}</span> },
    { key: "email", header: "Email", value: (u) => u.email, render: (u) => u.email },
    { key: "role", header: "Role", value: (u) => ROLE_LABELS[u.role], render: (u) => ROLE_LABELS[u.role] },
    { key: "district", header: "District", value: (u) => districtName(u.district_id), render: (u) => districtName(u.district_id) },
    { key: "status", header: "Status", value: (u) => (u.active ? "active" : "inactive"), render: (u) => <Chip tone={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Inactive"}</Chip> },
    { key: "account", header: "Account", value: (u) => (u.is_demo ? "demo" : ""), render: (u) => (u.is_demo ? <Chip tone="warning">Demo account</Chip> : null) },
    { key: "actions", header: "", render: (u) => u.id === me?.id ? null : (
      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggle(u); }}>{u.active ? "Deactivate" : "Activate"}</Button>) },
  ];

  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-6">
      <div className="flex items-end justify-between gap-4">
        <div><h1 className="text-xl font-semibold tracking-tight">Users</h1><p className="mt-1 text-sm text-slate-500">Accounts, roles and district assignments. Changes are audit-logged.</p></div>
        <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Add user</Button>
      </div>
      {!users.data ? <SkeletonCard lines={6} /> : <DataTable rows={users.data.items} columns={columns} rowKey={(u) => u.id} filterPlaceholder="Filter users…" initialSort={{ key: "name", dir: "asc" }} />}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add user" width="max-w-lg"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={create}>Create user</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="u-name" label="Full name" required error={touched ? errors.name : null}><input id="u-name" className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field id="u-email" label="Email" required error={touched ? errors.email : null}><input id="u-email" type="email" className="input" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field id="u-pass" label="Initial password" required error={touched ? errors.password : null}><input id="u-pass" type="password" className="input" value={form.password} onChange={(e) => set({ password: e.target.value })} /></Field>
          <Field id="u-role" label="Role"><select id="u-role" className="input" value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
          <div className="sm:col-span-2">
            <Field id="u-district" label="District" error={touched ? errors.district : null} hint="Limits what district officers see">
              <select id="u-district" className="input" value={form.district_id} onChange={(e) => set({ district_id: e.target.value })}>
                <option value="">None (state-wide)</option>{districts.data?.items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
