export type Role = "state_admin" | "district_officer" | "drone_operator" | "field_verifier";

export const ROLE_LABELS: Record<Role, string> = {
  state_admin: "State Admin",
  district_officer: "District Officer",
  drone_operator: "Drone Operator",
  field_verifier: "Field Verifier",
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  district_id: string | null;
  active: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface Me extends User {
  capabilities: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUnit {
  id: string;
  name: string;
  parent_id: string | null;
  is_demo: boolean;
  bbox: [number, number, number, number] | null;
  geometry?: GeoJSON.Geometry | null;
}

export interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}
