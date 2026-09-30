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

export type HealthClass = "healthy" | "moderate" | "severe";
export type SurveyStatus = "draft" | "planned" | "flying" | "uploaded" | "processing" | "processed" | "verified" | "archived";
export type BBox = [number, number, number, number];

export interface Survey {
  id: string;
  name: string;
  type: string;
  status: SurveyStatus;
  district_id: string | null;
  taluka_id: string | null;
  village_id: string | null;
  district_name: string | null;
  taluka_name: string | null;
  village_name: string | null;
  aoi_area_ha: number | null;
  bbox: BBox | null;
  aoi?: GeoJSON.Polygon | null;
  survey_date: string | null;
  season: string | null;
  notes: string | null;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  plot_count: number;
}

export interface PlotProps {
  id: string;
  plot_code: string;
  area_ha: number | null;
  is_candidate: boolean;
  is_demo: boolean;
  verification_status: string;
  has_ai_result: boolean;
  crop_pred?: string | null;
  crop_confidence?: number | null;
  ndvi_mean?: number | null;
  ndvi_p10?: number | null;
  ndvi_p90?: number | null;
  health_class?: HealthClass | null;
  stress_pct?: number | null;
  damage_pct?: number | null;
  model_version?: string | null;
}

export interface Feature<G, P> {
  type: "Feature";
  id?: string;
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G, P> {
  type: "FeatureCollection";
  features: Feature<G, P>[];
}

export interface AiResult {
  crop_pred: string | null;
  crop_confidence: number | null;
  ndvi_mean: number | null;
  ndvi_p10: number | null;
  ndvi_p90: number | null;
  health_class: HealthClass | null;
  stress_pct: number | null;
  damage_pct: number | null;
  model_version: string | null;
  is_demo: boolean;
}

export interface PlotDetail {
  id: string;
  plot_code: string;
  area_ha: number | null;
  parcel_ref: string | null;
  is_candidate: boolean;
  is_demo: boolean;
  village_name: string | null;
  geometry: GeoJSON.Polygon;
  bbox: BBox;
  survey: { id: string; name: string; survey_date: string | null; status: string; is_demo: boolean };
  ai_result: AiResult | null;
  verification: {
    status: string;
    count: number;
    latest: null | {
      actual_crop: string | null;
      crop_stage: string | null;
      health_class: HealthClass | null;
      damage_pct: number | null;
      decision: string | null;
      verified_at: string | null;
      photo_count: number;
    };
  };
}

export interface TimelinePoint {
  survey_id: string;
  survey_name: string;
  survey_date: string | null;
  plot_id: string;
  plot_code: string;
  ndvi_mean: number | null;
  health_class: HealthClass | null;
  crop_pred: string | null;
  is_demo: boolean;
}

export interface RasterInfo {
  id: string;
  kind: string;
  tiles_url: string | null;
  bounds: BBox | null;
  gsd_cm: number | null;
  stats: Record<string, number | string> | null;
  legend: string | null;
  rescale: [number, number] | null;
  colormap_name: string | null;
  is_demo: boolean;
  calibrated: boolean;
}

export type Level = "state" | "district" | "taluka" | "village";

export interface SummaryChild {
  id: string;
  name: string;
  level: Level | "survey";
  is_demo: boolean;
  surveys?: number;
  surveyed_area_ha?: number;
  fields_analysed?: number;
  healthy_pct?: number | null;
  contains_demo?: boolean;
  bbox: BBox | null;
  geometry?: GeoJSON.MultiPolygon | null;
  survey_date?: string | null;
  status?: SurveyStatus;
}

export interface DashboardSummary {
  level: Level;
  unit: { id: string; name: string; is_demo: boolean; bbox: BBox | null; geometry?: GeoJSON.MultiPolygon | null } | null;
  path: { level: Level; id: string; name: string; bbox: BBox | null }[];
  cards: {
    total_surveyed_area_ha: number;
    active_surveys: number;
    completed_surveys: number;
    fields_analysed: number;
    analysed_area_ha: number;
    healthy_pct: number | null;
    stress_pct: number | null;
    possible_damage_pct: number | null;
    pending_verifications: number;
  };
  crop_distribution: { crop: string; area_ha: number; plots: number; pct: number | null }[];
  health: { health_class: HealthClass; area_ha: number; plots: number; pct: number | null }[];
  verification_funnel: { stage: string; label: string; plots: number }[];
  basis: { survey_ids: string[]; description: string };
  contains_demo: boolean;
  children: SummaryChild[];
}

export interface SearchResult {
  type: "district" | "taluka" | "village" | "survey" | "plot" | "crop" | "coordinate";
  id: string;
  label: string;
  sublabel: string;
  bbox?: BBox | null;
  point?: [number, number];
  survey_id?: string;
  crop?: string;
  is_demo?: boolean;
}

export interface Alert {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  message: string;
  survey_id: string | null;
  plot_id: string | null;
  read: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface MapConfig {
  basemap: { tiles_url: string; attribution: string };
  satellite: { tiles_url: string | null; attribution: string };
  tile_server_url: string;
  crops: string[];
  raster_styles: Record<string, { rescale?: [number, number]; colormap_name?: string; legend?: string }>;
  initial_view: { center: [number, number]; zoom: number };
  health_thresholds: { ndvi_healthy_min: number; ndvi_moderate_min: number };
}

export interface SurveyWrite extends Survey {
  warnings: string[];
}

export interface Mission {
  id: string;
  survey_id: string;
  camera_profile: string;
  aircraft_profile: string;
  altitude_m: number;
  front_overlap: number;
  side_overlap: number;
  speed_ms: number | null;
  heading_deg: number | null;
  gsd_cm: number | null;
  est_images: number | null;
  est_flights: number | null;
  est_area_ha: number | null;
  status: "draft" | "ready" | "authorized" | "in_flight" | "completed" | "cancelled";
  authorized_by: string | null;
  authorized_at: string | null;
  created_at: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  telemetry: string | null;
  ok: boolean;
  value: string | null;
  checked_at: string | null;
}

export interface ChecklistState {
  mission_id: string;
  status: Mission["status"];
  items: ChecklistItem[];
  all_ok: boolean;
  can_authorize: boolean;
  authorize_enabled: boolean;
  authorized_by: string | null;
  authorized_at: string | null;
}

export interface DefaultAoi {
  source: string;
  geometry: GeoJSON.Polygon;
  area_ha: number;
  bbox: BBox;
}
