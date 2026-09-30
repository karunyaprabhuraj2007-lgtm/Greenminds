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

export type BBox = [number, number, number, number];

export interface AdminUnit {
  id: string;
  name: string;
  parent_id: string | null;
  is_demo: boolean;
  bbox: BBox | null;
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
  last_clear_satellite_date: string | null;
}

export interface SurveyWrite extends Survey {
  warnings: string[];
}

export interface PlotProps {
  id: string;
  plot_code: string;
  area_ha: number | null;
  parcel_ref: string | null;
  source: string | null;
  is_candidate: boolean;
  is_demo: boolean;
  verification_status: string;
  has_ai_result: boolean;
  crop_pred?: string | null;
  crop_confidence?: number | null;
  health_class?: HealthClass | null;
  sat_ndvi: number | null;
  sat_date: string | null;
  sat_health: HealthClass | null;
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
  ai_result: null | { crop_pred: string | null; crop_confidence: number | null; health_class: HealthClass | null; model_version: string | null };
  verification: {
    status: string;
    count: number;
    latest: null | { actual_crop: string | null; health_class: HealthClass | null; decision: string | null; verified_at: string | null; photo_count: number };
  };
}

export interface Job {
  id: string;
  kind: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  log: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface NdviPoint {
  date: string;
  scene_id: string;
  platform: string | null;
  scene_cloud_pct: number | null;
  clear_fraction: number;
  valid_pixels: number;
  ndvi_mean: number | null;
  ndvi_p10: number | null;
  ndvi_p90: number | null;
}

export interface SatelliteSeries {
  source: string;
  attribution: string;
  licence?: string;
  stac_url?: string;
  min_clear_fraction: number;
  series: NdviPoint[];
  scenes_total?: number;
  scenes_clear?: number;
  latest_clear: NdviPoint | null;
  layer?: null | { id: string; tiles_url: string | null; scene_id: string | null; acquired_at: string | null; cloud_cover: number | null; attribution: string | null };
  job?: Job | null;
}

export interface WeatherDay { day: string; precip_mm: number | null; tmax_c: number | null; tmin_c: number | null; source: "archive" | "forecast" }

export interface WeatherResponse {
  source: string;
  attribution: string;
  licence: string;
  days: WeatherDay[];
  totals: { rain_mm_last_90d: number | null; rain_mm_last_30d: number | null };
  fetched_at: string | null;
  job: Job | null;
}

export interface RefreshResponse { cached: boolean; running: boolean; job: Job }

export type Level = "state" | "district" | "taluka" | "village";

export interface SummaryChild {
  id: string;
  name: string;
  level: Level | "survey";
  is_demo: boolean;
  surveys?: number;
  surveyed_area_ha?: number;
  plots_mapped?: number;
  healthy_pct?: number | null;
  bbox: BBox | null;
  geometry?: GeoJSON.MultiPolygon | null;
  survey_date?: string | null;
  status?: SurveyStatus;
  aoi_area_ha?: number | null;
}

export interface DashboardSummary {
  level: Level;
  empty: boolean;
  unit: { id: string; name: string; is_demo: boolean; bbox: BBox | null; geometry?: GeoJSON.MultiPolygon | null } | null;
  path: { level: Level; id: string; name: string; bbox: BBox | null }[];
  cards: {
    surveys_total: number;
    active_surveys: number;
    completed_surveys: number;
    total_surveyed_area_ha: number;
    plots_mapped: number;
    plots_area_ha: number;
    field_verifications: number;
    pending_verifications: number;
    satellite_monitored_surveys: number;
    last_clear_satellite_date: string | null;
    health_assessed_plots: number;
    healthy_pct: number | null;
    stress_pct: number | null;
  };
  health: { health_class: HealthClass; area_ha: number; plots: number; pct: number | null }[];
  health_basis: { source: string; as_of: string | null; description: string };
  crop_distribution: { crop: string; area_ha: number; plots: number; pct: number | null }[];
  verification_funnel: { stage: string; label: string; plots: number }[];
  trends: { surveys_per_month: { month: string; value: number }[]; ndvi_monthly_mean: { month: string; value: number | null }[] };
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

export interface DatasetInfo {
  key: string; name: string; provider: string; original_source: string | null; licence: string; url: string | null; version: string | null; attribution: string;
}

export interface MapConfig {
  basemap: { tiles_url: string; attribution: string };
  basemaps: { light: { tiles_url: string; attribution: string }; dark: { tiles_url: string; attribution: string } };
  boundaries: { attribution: string | null; datasets: DatasetInfo[] };
  satellite: { tiles_url: string | null; attribution: string };
  satellite_source: { name: string; attribution: string; licence: string; stac_url: string };
  tile_server_url: string;
  crops: string[];
  raster_styles: Record<string, { rescale?: [number, number]; colormap_name?: string; legend?: string }>;
  initial_view: { center: [number, number]; zoom: number };
  health_thresholds: { ndvi_healthy_min: number; ndvi_moderate_min: number };
}

export interface Mission {
  id: string;
  survey_id: string;
  camera_profile: string;
  aircraft_profile: string;
  altitude_m: number;
  front_overlap: number;
  side_overlap: number;
  gsd_cm: number | null;
  status: "draft" | "ready" | "authorized" | "in_flight" | "completed" | "cancelled";
  authorized_by: string | null;
  authorized_at: string | null;
  created_at: string;
}

export interface ChecklistItem { key: string; label: string; telemetry: string | null; ok: boolean; value: string | null; checked_at: string | null }

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

export interface InputAoi { source: string; geometry?: GeoJSON.Polygon; area_ha?: number; bbox?: BBox; error?: string }
