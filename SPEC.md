# GREENMINDS CROP INTELLIGENCE PLATFORM — MASTER BUILD SPEC

> Hand this whole file to Claude Code. Save it in the repo root as `SPEC.md` and also copy the "CLAUDE.md" block (Section 0) into `CLAUDE.md`.
> Kickoff prompt to paste into Claude Code is at the very end (Section 19).

---

## 0. CLAUDE.md (copy this block into `CLAUDE.md`)

```markdown
# GreenMinds Crop Intelligence Platform
Drone-first geospatial crop survey platform for Maharashtra agriculture (Rehydria Technology project).
Pipeline: Drone survey -> processing -> AI analysis -> GIS map -> field verification -> government dashboard.
Full requirements are in SPEC.md. Read it before every phase.

## Non-negotiable rules
1. Work phase by phase (SPEC.md Section 17). After each phase: run tests, run the app, commit, and report what works and what does not.
2. AI results and human-verified results are stored separately. AI never makes the final administrative decision.
3. Never overwrite old surveys. Every survey is dated and kept.
4. Any seeded/demo number shown in the UI must carry a visible "Demo data" badge.
5. Never display or claim an accuracy figure that was not computed on a held-out test set by the code itself.
6. Everything runs with `docker compose up` (optional heavy services behind compose profiles).
7. Every backend endpoint has a test. Every geometry function has unit tests with known-answer cases.
8. Keep README.md current: how to run, env vars, demo script, known limitations.
9. Config (camera specs, thresholds, URLs) lives in env/config files, never hard-coded.
10. UI style: white / light grey, dark navy (#0B1F3A), subtle green (#2E7D32). Professional government-GIS look. No heavy gradients.

## Stack
Frontend: React + Vite + TypeScript + Tailwind + MapLibre GL
Backend: FastAPI (Python 3.11), SQLAlchemy 2 + GeoAlchemy2, Alembic, PostgreSQL 16 + PostGIS 3
Processing: WebODM/NodeODM API, rasterio, numpy, geopandas, shapely, pyproj, scikit-learn
Storage: MinIO (S3). Tiles: TiTiler (COG). Video: MediaMTX. Telemetry: pymavlink -> WebSocket. Simulator: ArduPilot SITL.
```

---

## 1. PRODUCT SUMMARY

**Name:** GreenMinds Crop Intelligence Platform
**Owner:** Rehydria Technology Private Limited (GreenMinds)
**Problem:** Crop surveys in Maharashtra are manual, slow, and inaccurate, which hurts crop planning, subsidy distribution, insurance verification, and disaster assessment.
**Solution:** A web-based geospatial decision-support system where an RTK-enabled survey drone captures high-resolution multispectral imagery, the software turns it into an orthomosaic and vegetation indices, AI/analytics produce plot-level crop intelligence, field officers verify results on a mobile app, and officers see everything on a GIS dashboard with reports.

**Core flow:**
`Define area -> Plan mission -> Fly (live telemetry + live video) -> Upload data -> Process (orthomosaic, NDVI) -> Plot intelligence -> Field verification -> Reports`

**Design philosophy:**
- Drone is the primary data source (high resolution).
- Satellite (Sentinel-2) is optional supporting context: screening, history, priority areas.
- Human-in-the-loop: AI proposes, human verifies, both are recorded separately.

**Deadline context:** ~10 days. Priority is a working end-to-end demo on a real plot, with a clean fallback demo mode (simulated drone + recorded video + sample dataset).

---

## 2. HARDWARE CONTEXT (drives design decisions)

| Item | Detail | Design implication |
|---|---|---|
| Flight controller | Pixhawk 6X, ArduPilot | MAVLink telemetry, mission upload via exported waypoint file |
| Positioning | RTK GNSS | Show fix type: 6 = RTK fixed, 5 = RTK float; flag survey quality |
| Survey camera | MAPIR Survey3 (multispectral, filter RGN or OCN or similar) | Stills to SD card, NO live video. Triggered by PWM from Pixhawk AUX. Images uploaded after flight |
| Live video camera | Separate camera (TBD: Skydroid C12 / FPV / Pi camera) | Assume RTSP or USB capture -> ffmpeg -> MediaMTX -> browser (WebRTC, HLS fallback). Source URL is config |
| Ground station | Laptop running the stack + MAVLink link (telemetry radio or UDP) | Backend telemetry bridge connects via serial or UDP |

**Important:** Survey3 camera parameters and band order MUST be configurable (`config/cameras.yaml`). Ship defaults but mark them "verify against MAPIR datasheet":
```yaml
survey3w_rgn:
  image_width_px: 4000
  image_height_px: 3000
  focal_length_mm: 3.37
  pixel_size_um: 1.55
  min_trigger_interval_s: 2.0
  band_map: {red: 0, green: 1, nir: 2}   # channel indices; VERIFY per MAPIR docs for the filter in use
survey3n_rgn:
  image_width_px: 4000
  image_height_px: 3000
  focal_length_mm: 8.25
  pixel_size_um: 1.55
  min_trigger_interval_s: 2.0
  band_map: {red: 0, green: 1, nir: 2}
```
Sensor width = image_width_px * pixel_size_um; height likewise. GSD = (pixel_size * altitude) / focal_length.

---

## 3. ARCHITECTURE

```
                 +---------------------- Browser (React + MapLibre) ----------------------+
                 |  Dashboard | GIS Map | Surveys | Missions | Live | Crop Intel | Verify |
                 +-----------------------------+------------------------------------------+
                                               | REST + WebSocket + WebRTC/HLS
+-------------+   MAVLink   +------------------v------------------+     +------------------+
| Pixhawk 6X  +------------>+ FastAPI backend                      +<--->+ PostgreSQL/PostGIS|
| (or SITL)   |  serial/UDP | - auth/RBAC, audit log               |     +------------------+
+-------------+             | - survey/mission/plot APIs           |     +------------------+
                            | - flight planner                     +<--->+ MinIO (S3)       |
+-------------+  RTSP/USB   | - telemetry bridge (WS)              |     +------------------+
| Live camera +-->ffmpeg--->+ - processing worker (jobs)           |     +------------------+
+-------------+     |       +------------------+-------------------+<--->+ WebODM/NodeODM   |
                    v                          |                        +------------------+
              +-----------+                    v                        +------------------+
              | MediaMTX  |            +---------------+<-------------->+ TiTiler (COG)    |
              +-----------+            | Worker (RQ/   |                +------------------+
                                       | Celery-lite)  |
                                       +---------------+
```

Background jobs: use a lightweight queue (RQ + Redis) for processing tasks so the API stays responsive.

---

## 4. REPOSITORY LAYOUT

```
greenminds-gis/
  CLAUDE.md
  SPEC.md
  README.md
  docker-compose.yml
  .env.example
  config/
    cameras.yaml
    thresholds.yaml
    aircraft.yaml
  backend/
    app/
      main.py
      core/ (config.py, security.py, deps.py, audit.py)
      db/ (base.py, models/, session.py)
      api/ (auth.py, users.py, surveys.py, missions.py, flightplan.py, telemetry.py,
            uploads.py, processing.py, plots.py, intelligence.py, verification.py,
            reports.py, admin_units.py, layers.py, notifications.py)
      services/
        flightplan/ (grid.py, camera.py, export_qgc.py, export_mp.py)
        telemetry/ (bridge.py, sitl.py, replay.py, parsers.py)
        processing/ (odm_client.py, calibration.py, indices.py, plots.py, classify.py, damage.py)
        reports/ (pdf.py, csv_geojson.py)
        storage.py
      seed/ (seed_demo.py, demo_data/)
      workers/ (queue.py, jobs.py)
    alembic/
    tests/
    pyproject.toml
  frontend/
    src/
      app/ (routes, auth context, api client)
      pages/ (Login, Dashboard, GisMap, Surveys, SurveyNew, MissionLive, Processing,
              CropIntelligence, Verification, Reports, Users, Settings)
      components/ (MapView, LayerPanel, PlotPanel, StatCards, VideoPanel, TelemetryHud,
                   TimelineChart, BeforeAfterSlider, DemoBadge, Sidebar, TopBar)
      field/ (FieldApp PWA: service worker, IndexedDB queue, sync)
    public/manifest.webmanifest
  tools/
    ffmpeg_stream_examples.md
    sitl/ (docker files, params, sample mission)
    sample_data/ (sample images, sample orthomosaic COG, sample tlog)
  docs/
    DEMO_SCRIPT.md
    ARCHITECTURE.md
    LIMITATIONS.md
```

---

## 5. DOCKER COMPOSE (services)

| Service | Image / build | Port | Profile |
|---|---|---|---|
| db | postgis/postgis:16-3.4 | 5432 | default |
| redis | redis:7 | 6379 | default |
| minio | minio/minio | 9000/9001 | default |
| backend | ./backend | 8000 | default |
| worker | ./backend (rq worker) | - | default |
| frontend | ./frontend (vite dev / nginx) | 5173 | default |
| titiler | ghcr.io/developmentseed/titiler | 8001 | default |
| mediamtx | bluenviron/mediamtx | 8554 RTSP, 8889 WebRTC, 8888 HLS | default |
| nodeodm | opendronemap/nodeodm | 3000 | `odm` |
| sitl | ArduPilot SITL container (ArduCopter) | UDP 14550 | `sim` |

`docker compose up` = core platform. `docker compose --profile odm --profile sim up` = with real processing and simulator.
`.env.example` includes: DB creds, JWT secret, MinIO keys, `VIDEO_SOURCE_URL`, `MAVLINK_URL` (e.g. `udp:0.0.0.0:14550` or `serial:/dev/ttyUSB0:57600`), `TELEMETRY_MODE` (`live|sitl|replay`), `NODEODM_URL`, `CAMERA_PROFILE`, `AIRCRAFT_PROFILE`.

---

## 6. DATA MODEL (PostGIS)

Use UUID primary keys, `created_at`, `updated_at`, soft-delete where useful. Geometry SRID 4326.

```
users(id, name, email unique, password_hash, role enum[state_admin,district_officer,drone_operator,field_verifier], district_id nullable, active)
districts(id, name, geom MultiPolygon)
talukas(id, district_id, name, geom)
villages(id, taluka_id, name, geom)                       -- seed a small real/dummy set for the demo area
surveys(id, name, type enum[crop_survey,crop_health,damage_assessment,insurance_verification,subsidy_verification],
        district_id, taluka_id, village_id, aoi geom Polygon, aoi_area_ha, status enum[draft,planned,flying,uploaded,processing,processed,verified,archived],
        created_by, survey_date, season, notes)
missions(id, survey_id, camera_profile, aircraft_profile, altitude_m, front_overlap, side_overlap, speed_ms, heading_deg,
         gsd_cm, est_images, est_flights, est_area_ha, flights_json, waypoint_files_json, status, authorized_by, authorized_at)
preflight_checks(id, mission_id, item, ok bool, value text, checked_at)
flights(id, mission_id, flight_no, started_at, ended_at, duration_s, area_covered_ha, images_captured, rtk_fix_pct, log_object_key)
images(id, survey_id, flight_id, object_key, filename, captured_at, lat, lon, alt_m, band_set, geotag_source enum[exif,log,manual])
processing_jobs(id, survey_id, kind enum[validate,geotag,calibrate,photogrammetry,indices,plots,classify,damage,report],
                status enum[queued,running,done,failed], progress, log, started_at, finished_at, params_json)
rasters(id, survey_id, kind enum[orthomosaic,dsm,dtm,ndvi,gndvi,ndre,stress,damage], object_key, cog_url, crs, gsd_cm, bounds geom, stats_json)
plots(id, survey_id, plot_code unique per survey, geom Polygon, area_ha, village_id, parcel_ref nullable)
plot_ai_results(id, plot_id, survey_id, crop_pred, crop_confidence, ndvi_mean, ndvi_p10, ndvi_p90, health_class enum[healthy,moderate,severe],
                stress_pct, damage_pct, model_version, is_demo bool)
plot_verifications(id, plot_id, survey_id, verifier_id, actual_crop, crop_stage, health_class, damage_pct, notes, photo_keys[],
                   lat, lon, verified_at, decision enum[verified,needs_review,rejected], client_uuid unique)   -- SEPARATE from ai results
damage_assessments(id, plot_id, before_survey_id, after_survey_id, ndvi_before, ndvi_after, delta, class enum[none,low,moderate,severe])
alerts(id, kind, severity, message, survey_id nullable, plot_id nullable, read bool)
reports(id, survey_id, kind, object_key_pdf, object_key_csv, object_key_geojson, created_by)
audit_log(id, user_id, action, entity, entity_id, before_json, after_json, ip, at)
```

Indexes: GiST on every geometry; btree on survey_id, plot_id, status.

---

## 7. AUTH AND ROLES

- Email + password, bcrypt, JWT access (short) + refresh token.
- Role-based dependency `require_roles(...)` on every route.
- Permission matrix (demo scope):

| Capability | State Admin | District Officer | Drone Operator | Field Verifier |
|---|---|---|---|---|
| See all districts | yes | own district | own surveys | assigned plots |
| Create survey / mission | yes | yes | yes | no |
| Authorize mission | yes | yes | no (request only) | no |
| Upload flight data | yes | yes | yes | no |
| View plot intelligence | yes | yes | yes | assigned only |
| Submit field verification | no | no | no | yes |
| Final decision on plot | yes | yes | no | recommends |
| Manage users | yes | no | no | no |
| Reports | yes | yes | own | no |

- Every mutating request writes an `audit_log` row (middleware/decorator).
- Seed users (demo): one per role, password in README, clearly demo.

---

## 8. FLIGHT PLANNER (core feature — must be correct and tested)

**Endpoint:** `POST /api/flightplan/generate`

**Input:**
```json
{ "aoi": <GeoJSON Polygon>, "camera_profile": "survey3w_rgn", "altitude_m": 100,
  "front_overlap": 0.80, "side_overlap": 0.70, "speed_ms": null, "heading_deg": null,
  "aircraft_profile": "agroscan_quad", "home": {"lat":..,"lon":..}, "margin_m": 10 }
```

**Algorithm:**
1. Project AOI to local UTM (pyproj, auto-pick zone). Compute area in ha.
2. Camera footprint on ground: `footprint_w = sensor_w_mm * alt / focal_mm`, `footprint_h = sensor_h_mm * alt / focal_mm` (orient so footprint_w is across-track).
3. `line_spacing = footprint_w * (1 - side_overlap)`; `trigger_distance = footprint_h * (1 - front_overlap)`.
4. Heading: if null, use direction of the longest edge of the minimum rotated rectangle.
5. Rotate AOI by -heading, generate parallel lines at `line_spacing`, clip to AOI buffered by `margin_m`, order boustrophedon (lawnmower), rotate back, project to WGS84.
6. Speed: `speed = min(aircraft_cruise, trigger_distance / min_trigger_interval_s)`. Report the limiting factor.
7. Estimates: `gsd_cm`, total path length, flight time (path/speed + turns), number of images (path/trigger_distance), number of flights (split by `aircraft.max_flight_time_min * 0.7` safety factor; each flight starts/ends at home; split the line list, not mid-line), area per flight.
8. Return GeoJSON of flight lines, waypoints, per-flight split, and stats.

**Exports:**
- `GET /api/missions/{id}/export/qgc` -> QGroundControl `.plan` JSON with takeoff, waypoints, `DO_SET_CAM_TRIGG_DIST` (MAV_CMD 206) at first survey waypoint and `DO_SET_CAM_TRIGG_DIST 0` at end, RTL.
- `GET /api/missions/{id}/export/waypoints` -> Mission Planner text `.waypoints` (QGC WPL 110 format).
- One file per flight (`flight_1`, `flight_2`, ...).
- Add a note in the UI/README: camera trigger wiring and ArduPilot camera-trigger parameters differ by firmware version; operator must verify on the bench.

**Tests (known answers):**
- 100 m, Survey3W defaults: GSD ~4.6 cm/px (computed from config; test against formula).
- 100 ha square AOI gives expected line count within +-1.
- Lines never leave AOI+margin; overlap parameters honored; split flights cover all lines exactly once.
- Exported `.plan` validates against the QGC plan schema structure (required keys).

**UI (page SurveyNew):** step wizard: (1) name/type/district/taluka/village, (2) draw AOI polygon on map, live area in ha, (3) mission parameters with live recomputation of GSD/images/flights, preview flight lines on the map, (4) create mission, download files.

---

## 9. PRE-FLIGHT CHECKLIST AND AUTHORIZATION

- Checklist items: GNSS/RTK fix, battery, camera connected/SD space, home position, geofence, RTL, weather, no-fly zone check (Digital Sky), calibration target photographed.
- Items may auto-fill from live telemetry when available (GPS fix type, battery %, home set); others are manual toggles.
- **AUTHORIZE MISSION** is enabled only when all items are OK and the user's role allows it. Store `authorized_by/at`. Audit-logged.

---

## 10. LIVE MISSION SCREEN (telemetry + video)

**Telemetry bridge (`services/telemetry/bridge.py`):**
- Modes: `live` (pymavlink on `MAVLINK_URL`), `sitl` (UDP from SITL container), `replay` (play a `.tlog`/JSON file at real time or 5x).
- Read: HEARTBEAT (mode, armed), GLOBAL_POSITION_INT, VFR_HUD (speed, alt, heading), SYS_STATUS (battery %, voltage), GPS_RAW_INT (fix_type, sats, hdop), MISSION_CURRENT (waypoint index), CAMERA_FEEDBACK / CAMERA_TRIGGER counter (images captured).
- Publish 5 Hz JSON over `WS /ws/telemetry/{mission_id}`; also persist a decimated track (1 Hz) to DB/file for later replay.
- Derived: mission progress %, area covered (from track vs planned lines), RTK fix percent.
- Fix meaning: 3 = 3D, 4 = DGPS, 5 = RTK float, 6 = RTK fixed. Show colored badge.
- Reconnect logic, stale-data indicator (>2 s without packets shows "LINK LOST").

**Video:**
- MediaMTX receives a stream from ffmpeg. Provide `tools/ffmpeg_stream_examples.md` with commands for: RTSP camera relay, USB capture card (v4l2), Pi camera, and looping a recorded file as fallback.
- Frontend `VideoPanel`: WebRTC (WHEP) first, HLS fallback, "No signal" state, fullscreen, snapshot button.
- `VIDEO_SOURCE_URL` and MediaMTX path configurable.

**Screen layout:** map with live drone marker and track and planned lines (left/center), video panel + telemetry HUD (right), progress bar, images-captured counter, RTK badge, battery, RTL/geofence status. Buttons: mark flight start/end, save flight record (duration, area, images, RTK %).

**Demo/fallback:** `TELEMETRY_MODE=sitl` or `replay` plus looped video file gives a full working screen without hardware.

---

## 11. UPLOAD AND PROCESSING PIPELINE

**Upload (`POST /api/surveys/{id}/uploads`):** multipart/chunked to MinIO. Accept: images (JPG/TIFF/RAW-converted), flight log (`.bin`, `.tlog`, CSV), GCP file (optional), calibration target images (tagged), RTK log (optional). Validate file types and sizes; show progress; resumable if feasible.

**Job chain (each step is a `processing_jobs` row with progress + log, visible in the Processing page):**
1. **Validate:** count images, check EXIF/timestamps, detect blur/duplicates, check overlap by spacing, warn on gaps. Output a quality summary.
2. **Geotag:** if images lack GPS, geotag from the flight log by timestamp matching (configurable clock offset, default 0, UI field to set it). Record `geotag_source`.
3. **Calibrate (MAPIR):** if calibration-target images exist, compute per-band reflectance correction factors and apply to survey images; otherwise mark results "UNCALIBRATED — indices not comparable across dates" and show that badge on all derived layers.
4. **Photogrammetry:** call NodeODM/WebODM API (`POST /task/new`, poll `/task/{uuid}/info`, download `orthophoto.tif`, `dsm.tif`). Options exposed: `orthophoto-resolution`, `fast-orthophoto` toggle for demo speed. Convert outputs to Cloud-Optimized GeoTIFF (COG) and upload to MinIO. If NodeODM is not running, use a **sample orthomosaic** from `tools/sample_data` and label it "Sample data".
5. **Indices:** from the orthomosaic compute NDVI = (NIR - Red) / (NIR + Red); optionally GNDVI, NDRE if bands allow. Band mapping from `cameras.yaml`. Mask nodata. Write index COGs and per-raster stats.
6. **Plots:** if plot boundaries were uploaded (GeoJSON/Shapefile/KML), use them. Otherwise auto-generate candidate plots: threshold vegetation + morphological cleanup + polygonize + min-area filter + simplify. Mark auto plots "candidate — needs officer confirmation". Allow officer to edit (merge/split/redraw) on the map.
7. **Plot stats and health:** zonal stats per plot (mean/p10/p90 NDVI); health classes by `config/thresholds.yaml` (defaults: healthy > 0.6, moderate 0.3–0.6, severe < 0.3 — configurable, documented as indicative); stress % = area fraction below moderate threshold.
8. **Crop classification (`classify.py`):** features = plot NDVI stats, texture, (optional) Sentinel-2 seasonal NDVI curve. Model = RandomForest. Train from `plot_verifications` (actual crop) plus an optional labelled CSV. Requirements: stratified train/test split, store metrics (accuracy, per-class F1, confusion matrix) in DB and show in UI **only if computed**; if fewer than N labelled plots, show "Insufficient ground truth — classification unavailable" instead of fake outputs. Store `model_version`.
9. **Alerts:** create alerts for severe stress clusters, processing done, verification pending.

---

## 12. GIS MAP (page GisMap + component MapView)

- MapLibre GL with OSM/other free basemap (config) and drone orthomosaic via TiTiler tile URLs.
- Drill-down: Maharashtra -> district -> taluka -> village -> survey area -> plot. Fit-to-bounds on selection.
- **Layer panel** (toggle + opacity): Orthomosaic, Plot boundaries, Crop type (categorical colors), NDVI (colormap + legend), Crop stress, Damage, Survey status, Plot ID labels, Satellite context (optional), Historical surveys.
- Click plot -> right-side `PlotPanel`: plot code, area (ha), AI crop + confidence, NDVI stats, health class, stress %, damage %, verification status, photos, timeline sparkline, buttons: Open verification, Compare surveys.
- **Before/After slider** between two surveys of the same area.
- Search bar: village, survey id, plot code, coordinates (lat,lon), district, taluka, crop, date.
- Measure tool (distance/area), coordinate readout, scale bar.

---

## 13. DASHBOARDS

**Top cards (real numbers computed from DB; any seeded numbers get a `DemoBadge`):** Total surveyed area (ha), Active surveys, Completed surveys, Fields analysed, Healthy %, Stress %, Possible damage %, Pending verifications.

**Hierarchy views:** State -> District -> Taluka -> Village -> Survey -> Plot, each with aggregate stats and a choropleth.

**Crop distribution table** (crop, ha, %), **health donut**, **verification funnel** (AI-only vs verified), **alerts feed**.

**Timeline per plot:** dated NDVI/health points (one point per survey). **History:** surveys are never overwritten; list all dates for a plot.

---

## 14. FIELD VERIFICATION (PWA at `/field`)

- Installable PWA, offline-first: service worker caches app shell + assigned plots; IndexedDB queue for submissions and photos; background sync when online.
- Screens: assigned plots list (distance from current GPS), plot detail with AI result and map, verification form.
- Form fields: actual crop, crop stage, health class, damage %, notes, photo capture (camera input, compress client-side), GPS auto-capture (lat/lon/accuracy), timestamp, decision (verified / needs review / rejected).
- Submission idempotent via `client_uuid`. Stored in `plot_verifications`, never merged into `plot_ai_results`.
- Officer-side: side-by-side "AI result vs Human verified result" and agreement rate per survey (real, computed).
- Only authorized officers set the **final decision**; the verifier "recommends".

---

## 15. MODULES BUILT ON PLOT DATA

**Damage assessment:** choose two surveys of the same area (before/after); per plot compute NDVI delta and classify by thresholds in `thresholds.yaml`; outputs affected area totals by class, damaged plots on the map, PDF/CSV.

**Insurance verification:** search by plot code / claim id; show pre/post imagery slider, damage %, verification status; officer marks Verified / Needs Review / Rejected(insufficient evidence). Banner: "Decision support only."

**Subsidy verification:** declared crop and declared area (manual entry or CSV import) vs detected crop and measured area; show mismatch % and evidence; officer decision recorded and audited.

These three share the same tables (plots, ai_results, verifications, damage_assessments) — build them as thin views over that data.

---

## 16. REPORTS AND EXPORTS

- Village/Survey report PDF: survey metadata, AOI map image, total/cultivated area, crop distribution, health summary, damaged area, verification summary (AI vs human), methodology and limitations section, generated-by and timestamp, "Demo data" watermark if any seeded data is included.
- CSV (plots table), GeoJSON (plots with attributes). Shapefile and GeoTIFF export are stretch goals (GeoTIFF just links the COG).
- Reports page lists history with download links.

---

## 17. BUILD PHASES (Claude Code: complete in order; commit after each)

### Phase 1 — Foundation
Monorepo, docker-compose, `.env.example`, PostGIS schema + Alembic, JWT auth + RBAC, audit log, seed script (users, demo district/taluka/village, demo plots and demo AI results flagged `is_demo`), React app shell with login, sidebar, top bar, role-aware routing.
**Done when:** `docker compose up`, log in as each role, see role-appropriate menu; tests pass.

### Phase 2 — GIS map dashboard
MapLibre map, layers (plots, crop type, NDVI demo raster via TiTiler with a sample COG), layer panel, plot panel, dashboard cards, search, drill-down, DemoBadge.
**Done when:** clicking a demo plot shows full details; toggling layers works; cards show numbers.

### Phase 3 — New Survey + Flight Planner
Survey CRUD, AOI drawing, `flightplan` service with tests, mission parameter UI with live recompute, flight-line preview, QGC + Mission Planner exports, checklist + authorize.
**Done when:** draw a real field, get correct GSD/images/flights, download `.plan`, open it in QGroundControl without errors.

### Phase 4 — Telemetry + live mission screen
Bridge with live/sitl/replay modes, WebSocket, HUD, live track, MediaMTX + VideoPanel, ffmpeg examples, flight record saving.
**Done when:** with `sim` profile and a looping video file the whole screen works; with real Pixhawk over MAVLink it shows real telemetry.

### Phase 5 — Upload + processing
Upload to MinIO, job queue, validate/geotag/calibrate steps, NodeODM client, COG conversion, Processing page with per-step status and logs, sample-data fallback.
**Done when:** a small real image set (or sample set) produces an orthomosaic shown on the map.

### Phase 6 — Indices, plots, classification
NDVI/GNDVI, plot generation/import/editing, zonal stats, health classes, classifier with honest metrics, alerts.
**Done when:** the uploaded survey produces plots with NDVI and health; classification either works with real metrics or shows "insufficient ground truth".

### Phase 7 — Field verification PWA
PWA, offline queue, submission API, AI-vs-human comparison, final decision workflow.
**Done when:** submit a verification from a phone with airplane mode on, then reconnect and see it sync.

### Phase 8 — Damage / insurance / subsidy, reports, polish
Three verification modules, before/after slider, timeline, PDF/CSV/GeoJSON reports, notifications, docs (DEMO_SCRIPT, ARCHITECTURE, LIMITATIONS), full end-to-end test, demo mode toggle.
**Done when:** the demo script in `docs/DEMO_SCRIPT.md` runs start to finish twice in a row without errors.

---

## 18. API SURFACE (minimum)

```
POST   /api/auth/login | /api/auth/refresh          GET /api/auth/me
GET/POST/PATCH  /api/users
GET    /api/admin-units/{districts|talukas|villages}
GET/POST/PATCH  /api/surveys           GET /api/surveys/{id}
POST   /api/flightplan/generate
POST   /api/surveys/{id}/missions      GET /api/missions/{id}
POST   /api/missions/{id}/preflight    POST /api/missions/{id}/authorize
GET    /api/missions/{id}/export/{qgc|waypoints}
WS     /ws/telemetry/{mission_id}
POST   /api/missions/{id}/flights
POST   /api/surveys/{id}/uploads       GET /api/surveys/{id}/images
POST   /api/surveys/{id}/process       GET /api/surveys/{id}/jobs
GET    /api/surveys/{id}/rasters       GET /api/tiles/...   (proxy or direct TiTiler)
GET/PATCH /api/surveys/{id}/plots      POST /api/surveys/{id}/plots/import
GET    /api/plots/{id}                 GET /api/plots/{id}/timeline
GET    /api/surveys/{id}/stats         GET /api/dashboard/summary?level=state|district|taluka|village&id=
POST   /api/verifications/sync         GET /api/plots/{id}/verifications
POST   /api/plots/{id}/decision
POST   /api/damage/compare             GET /api/damage/{id}
GET    /api/insurance/lookup           GET /api/subsidy/lookup   POST /api/subsidy/import
POST   /api/reports                    GET /api/reports/{id}/download/{pdf|csv|geojson}
GET    /api/alerts                     PATCH /api/alerts/{id}
GET    /api/audit-log                  (state_admin only)
```
Use consistent pagination, error format, and OpenAPI docs at `/docs`.

---

## 19. KICKOFF PROMPT FOR CLAUDE CODE (paste this)

```text
Read CLAUDE.md and SPEC.md fully. We are building the GreenMinds Crop Intelligence Platform on a 10-day deadline.
Work in the phases from SPEC.md Section 17, strictly in order. Start with Phase 1 only.
For each phase: (1) briefly plan the tasks, (2) implement, (3) write and run tests, (4) run the app with docker compose and verify the "Done when" criteria, (5) commit with a clear message, (6) give me a short report: what works, what is stubbed, what I must test on real hardware.
Rules: follow every rule in CLAUDE.md; ask me before adding any dependency not in the stack; never invent accuracy numbers; label all seeded data as demo; keep the README updated.
If something in the spec is ambiguous or impossible, choose the simplest reasonable option, note it in docs/LIMITATIONS.md, and continue.
Begin Phase 1 now.
```

After each phase, paste this to continue:

```text
Phase N is accepted. Re-read SPEC.md Section 17 and proceed to Phase N+1 with the same process.
```

---

## 20. HARDWARE TESTS YOU MUST DO YOURSELF (Claude Code cannot do these)

1. Confirm what your live-video camera outputs (RTSP / HDMI / analog) and get the ffmpeg command working into MediaMTX.
2. Bench-test Survey3 trigger from the Pixhawk AUX output; confirm images are written and spacing matches the planned trigger distance.
3. Confirm the Survey3 filter type and band/channel order (fix `cameras.yaml` `band_map` if needed).
4. Photograph the MAPIR reflectance target before and after each flight.
5. Verify camera-trigger and geofence/RTL parameters for your ArduPilot version, then test in SITL and a low, short real flight.
6. Check Digital Sky no-fly zones and follow your Remote Pilot Certificate rules for every flight.
7. Fly twice: once early (retry buffer) and once for the clean demo dataset.

---

## 21. DEMO SCRIPT (write to `docs/DEMO_SCRIPT.md`, ~8 minutes)

1. Login as District Officer, show dashboard and layers on a previous (sample/seeded, badged) survey.
2. New Survey: draw the real plot, show GSD/images/flights, download the waypoint file.
3. Live mission: real drone or SITL, live telemetry, live video, RTK badge.
4. Upload the real flight images, watch the processing pipeline.
5. Show the orthomosaic and NDVI on the map, plot-level health and stats.
6. Phone: field verification (offline then sync), then AI vs human comparison.
7. Damage assessment before/after and insurance/subsidy lookup (state clearly which data is demo).
8. Generate the PDF report. Close with the roadmap: state-scale satellite screening, own photogrammetry, more roles, integration with government land records.

---

## 22. HONESTY AND LIMITATIONS (must appear in `docs/LIMITATIONS.md` and the report)

- Indices are only comparable across dates if calibrated with the reflectance target.
- Health thresholds are indicative and configurable, not agronomically certified.
- Crop classification quality depends entirely on the ground-truth samples collected; report only the measured metrics on held-out data.
- Demo dashboards contain seeded data and are labelled as such.
- AI outputs are decision support only; final decisions require an authorized officer.
- Flights must comply with DGCA rules, Digital Sky restrictions, and the pilot's RPC conditions.
