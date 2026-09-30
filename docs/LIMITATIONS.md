# Known limitations and decisions

This file records honest limitations (SPEC.md Section 22) and every place where the
spec was ambiguous or not possible and a simpler option was chosen.

## Honesty statements (apply to the whole platform)

- Vegetation indices are only comparable across dates if images were calibrated with the
  MAPIR reflectance target. Uncalibrated results are labelled as such.
- Health thresholds (`config/thresholds.yaml`) are indicative and configurable, not
  agronomically certified.
- Crop classification quality depends entirely on the ground-truth samples collected.
  Only metrics measured by the code on a held-out test set are ever shown.
- No dashboard data is seeded; only demo user accounts exist, and they are labelled "Demo account".
- AI outputs are decision support only; final decisions require an authorized officer.
- Flights must comply with DGCA rules, Digital Sky restrictions, and the pilot's RPC conditions.

## Data sources, licences and what is real (Phase 2B)

No survey, plot, AI result, alert or dashboard number is seeded. Everything shown
comes from rows users create (surveys, drawn / imported plots, verifications) or
from the external datasets below. Where nothing exists, the UI shows an empty state.

| Dataset | Used for | Provider / origin | Licence | Stored |
|---|---|---|---|---|
| District boundaries (ADM2, boundary year 2021, geoBoundaries IND-ADM2-76128533) | Map, drill-down, dashboard | geoBoundaries gbOpen; original: Pathways Data Pvt. Ltd., lgdirectory.gov.in | ODbL 1.0 | `districts` (36) + `datasets` row |
| Taluka / sub-district boundaries (ADM3, boundary year 2018, IND-ADM3-7132399) | Map, drill-down, survey forms | geoBoundaries gbOpen; same original source | ODbL 1.0 | `talukas` (357) + `datasets` row |
| State outline (ADM1, IND-ADM1-1811400) | Only to select the districts inside Maharashtra | geoBoundaries gbOpen; original: DataMeet / Election Commission of India | CC BY 2.5 IN | `datasets` row |
| Sentinel-2 L2A surface reflectance (B04, B08, SCL) | NDVI time series, latest clear NDVI layer, plot health | Copernicus / ESA, via Element 84 Earth Search STAC (`sentinel-2-l2a`) | Copernicus Sentinel data terms (free, full, open) | `satellite_observations`, NDVI COG in `DATA_DIR/satellite/` |
| Daily rainfall and temperature | Survey weather charts | Open-Meteo (ERA5-based archive + forecast API) | CC BY 4.0 | `weather_daily` |
| Basemap tiles | Map background | OpenStreetMap (light), CARTO (dark), configurable | ODbL data; tile usage policies apply | not stored |

Attribution is shown in the map footer, on every layer entry (source · date · cloud · licence),
under charts, and on the *Account & data sources* page.

**Not real / not available**

- **Villages:** no open village boundary dataset is bundled, so the village level is empty
  and hidden in forms and drill-down (taluka → surveys). The earlier demo village rectangles
  were removed (references cleared).
- **Boundaries are simplified** geoBoundaries releases (vertex-reduced), and ADM2 (2021) and
  ADM3 (2018) come from different years; talukas are assigned to the district that contains
  their representative point. Not for legal / cadastral use.
- **Crop health** on the dashboard and map is a *Sentinel-2 NDVI class* per plot (latest
  observation with ≥ 60 % of the plot cloud-free), with indicative thresholds from
  `config/thresholds.yaml`. It is not crop classification and not an AI result. Crop-type
  results only appear once a classifier produces them (Phase 6).
- **Sentinel-2 is 10 m resolution:** plots smaller than roughly 0.1 ha (fewer than
  `min_valid_pixels` clear pixels) get no NDVI. Pixels are counted when their centre falls
  inside the plot.
- **Plot geometry is never generated.** Plots come only from officers drawing them or
  importing GeoJSON / KML / zipped shapefiles (reprojected from the `.prj`).
- **Demo accounts** remain (one per role, `DEMO_PASSWORD`), labelled "Demo account" in the UI.
  Disable with `SEED_DEMO_DATA=false` and deactivate them for real use.
- **Tests** use a hand-written STAC response in Earth Search v1 format with small generated
  rasters (`backend/tests/satellite_fixture.py`), because the live API was unreachable from the
  build sandbox. The live API has not been exercised from this environment.

**What failed to load in the build sandbox (network policy, not code)**

| URL | Error |
|---|---|
| `https://earth-search.aws.element84.com/v1/search` | proxy CONNECT 403 — "Host not in allowlist: earth-search.aws.element84.com" |
| `https://archive-api.open-meteo.com/v1/archive` | proxy CONNECT 403 |
| `https://api.open-meteo.com/v1/forecast` | proxy CONNECT 403 |
| `https://www.geoboundaries.org/api/...` | proxy CONNECT 403 (the same release files were downloaded from the geoBoundaries GitHub media host instead) |
| `https://tile.openstreetmap.org/...`, `https://a.basemaps.cartocdn.com/...` | blocked; screenshots therefore have no basemap |

The Sentinel-2 and weather jobs fail gracefully in that case: the job is marked failed, the
exact error is shown on the survey page, and previously stored data is kept.

## Decisions taken where the spec was ambiguous

- **Object storage image.** MinIO no longer publishes images on Docker Hub (`minio/minio`
  cannot be pulled). The compose service keeps the name `minio` and the app keeps the
  `MINIO_*` variables, but the default image is **RustFS** (`rustfs/rustfs`), an
  S3-compatible, MinIO-compatible server. Any S3 server image can be used by setting
  `S3_IMAGE`. Storage is not used until Phase 5; the app will talk plain S3 API.
- **Extra columns beyond SPEC Section 6.** `is_demo` on admin units, users, surveys, plots,
  rasters and alerts (no seeded record remains except demo users); provenance columns on
  units (`source_id`, `dataset_id`), plots (`source`, `created_by`) and rasters (`source`,
  `scene_id`, `acquired_at`, `cloud_cover`, `attribution`); a `datasets` table;
  `plots.is_candidate` marks auto-generated plots awaiting officer confirmation;
  `rasters.calibrated` drives the "UNCALIBRATED" badge; `reports.generated_at`.
  `damage_assessments.class` is exposed as `damage_class` in Python (reserved word).
- **Mission status values** are not listed in the spec; chosen:
  `draft, ready, authorized, in_flight, completed, cancelled`.
- **Permission matrix.** Implemented as capabilities in `backend/app/core/permissions.py`.
  `/api/auth/me` returns the caller's capabilities, and the frontend menu is built from
  them. Row-level scoping ("own district", "own surveys", "assigned plots") is enforced
  per endpoint as each data endpoint is built; in Phase 1 it applies to admin units
  (district officers only see their own district).
- **Audit log.** Implemented as an explicit `record_audit(...)` call in every mutating
  endpoint (same DB transaction as the change) rather than a generic middleware, so the
  row can carry before/after snapshots. Logins and failed logins are also audited.
- **JWT refresh tokens** are stateless (not stored server-side), so they cannot be revoked
  individually before expiry (default 7 days). Deactivating a user blocks both refresh
  and access immediately because every request re-loads the user.
- **SITL container** (`sim` profile) is a placeholder until Phase 4.

## Phase 2 (GIS map dashboard)

- **Tiles are served by the backend (rio-tiler)** at
  `/api/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=...&rescale=...&colormap_name=...`,
  the same URL shape as TiTiler. The `url` must match a registered raster in a survey the
  caller can see, so the endpoint cannot read arbitrary files or URLs. TiTiler is kept as an
  optional compose profile (`--profile tiles`, then `TILE_SERVER_URL=http://localhost:8001`).
  TiTiler has no access control of its own; only use it on a trusted network.
- **"Current survey" rule for dashboards.** Surveys are never overwritten, so the same field
  can appear in several dated surveys. Plot counts, areas, health and verification figures use
  only the plots of the latest survey of each area (a survey is superseded when a later
  survey's AOI intersects it). Total surveyed area is the geodesic area of the union of all
  AOIs, so overlapping surveys are counted once. Percentages are area-weighted.
- **Field verifier data scope.** "Assigned plots only" needs a plot-assignment table,
  which arrives with the field app in Phase 7. Until then field verifiers get no survey,
  plot or tile data (404) and no dashboard.
- **Drone operator scope** is "surveys they created".
- **Plot and unit labels** on the map are HTML markers (no glyph/font server is needed);
  they appear from zoom 14.5 to avoid clutter.
- **Historical surveys on the map** are detected in the browser by date + bounding-box
  overlap (the backend dashboard uses exact AOI intersection).
- **Measure tool** uses spherical formulas (haversine distance, spherical-excess area),
  accurate to well under 0.5% at field scale. Official areas (plots, AOIs) are always
  computed geodesically on the backend.
- **Basemap** is OpenStreetMap raster tiles by default (`BASEMAP_TILES_URL`). OSM's tile usage
  policy does not allow heavy production use; configure your own tile server or a
  commercial provider for deployment. Satellite context is off unless
  `SATELLITE_TILES_URL` is set.
- **Unbuilt pages are hidden** from navigation (live mission, processing, crop intelligence,
  verification review, field app, damage/insurance/subsidy, reports) until their backend exists.
- **Sentinel-2 refresh** is a background job (RQ worker). A refresh within
  `min_refresh_interval_hours` (6 h) returns the cached result unless forced; already
  processed scenes are never re-read for a target (per-scene cache). Scenes above
  `max_scene_cloud_pct` (80 %) whole-tile cloud are not requested.
- **Weather** comes from the Open-Meteo archive for days older than 6 days and from the
  forecast API for recent days and the next 7; archive values win where both exist.

## Phase 3 (in progress)

- **Flight planner not integrated yet.** `greenminds_core_modules.zip` (flight planner,
  QGC / Mission Planner exporters, indices module and their tests) and the `inputs/`
  field polygon were not in the repository when Phase 3 started (no `main` branch on
  GitHub). Per instructions the planner math is not rewritten here. Still to do once the
  module is available: `POST /api/flightplan/generate`, mission creation
  (`POST /api/surveys/{id}/missions`), live GSD / image / flight estimates and flight-line
  preview in the wizard, and the `.plan` / `.waypoints` exports (one file per flight).
- **Survey rules.** A new survey starts as `draft`. Its AOI can be edited only while
  `draft` or `planned`; after a flight the AOI is part of the dated record and is frozen
  (create a new survey instead). Status can only be set to `archived` directly; other
  statuses follow the workflow. AOIs over `survey.max_aoi_area_ha` (default 2000 ha) are
  rejected. An AOI outside the selected taluka/district is accepted with a warning,
  because the boundaries are simplified.
- **Who may create surveys.** State admins anywhere; district officers and drone operators
  only in their own district (when they have one).
- **Pre-flight checklist** items come from `config/preflight.yaml`. Every submission is kept
  (history); the latest entry per item counts. When all items are OK the mission becomes
  `ready`. Only state admins and district officers can AUTHORIZE; drone operators can
  *request* authorization, which creates an alert for officers. Marking any item not-OK
  after authorization revokes it (audit action `authorization_revoked`). Auto-filling items
  from live telemetry is Phase 4.
- **Wizard AOI drawing** is click-to-add-vertex with Undo / Clear (no vertex dragging) to
  avoid adding a drawing library. The live area is a spherical estimate; the stored
  area is geodesic (they agree to within about 1%).
- **Bug fixed during Phase 3:** `geodesic_area_ha` now re-orients polygon rings before
  measuring, so holes are subtracted whatever their winding order (known-answer tests added).

## Build environment notes

- **Background jobs never ran in compose before Phase 2B:** the backend image installed an empty
  `app` package into site-packages, which the RQ worker imported instead of the source tree.
  Fixed in the Dockerfile (placeholder uninstalled, `PYTHONPATH=/app`).

## Open tasks carried forward

- **Phase 5:** test large multi-file uploads (hundreds of 5-10 MB Survey3 images) against the
  RustFS S3 store and record any issues here.
