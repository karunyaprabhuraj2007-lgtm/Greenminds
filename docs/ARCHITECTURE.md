# Architecture

See SPEC.md Section 3 for the target diagram. This file tracks what is actually built.

## Services (docker compose)

| Service | Purpose | Status |
|---|---|---|
| db | PostgreSQL 16 + PostGIS 3.4 | Phase 1 |
| redis | RQ job queue | Phase 1 (queue wired, jobs from Phase 5) |
| minio | S3-compatible object storage (RustFS image by default, see LIMITATIONS) | running, used from Phase 5 |
| backend | FastAPI API; runs Alembic migrations + boundary import / demo accounts on start | Phase 1 |
| worker | RQ worker (`greenminds` queue): Sentinel-2 and weather refresh jobs | Phase 2B |
| frontend | React SPA served by nginx; proxies `/api`, `/ws`, `/docs` to backend | Phase 1 |
| titiler (`tiles` profile) | Optional COG tile server; the backend serves tiles by default | optional |
| mediamtx | Live video relay (RTSP in, WebRTC/HLS out) | running, used from Phase 4 |
| nodeodm (`odm` profile) | Photogrammetry | Phase 5 |
| sitl (`sim` profile) | ArduPilot SITL | placeholder until Phase 4 |

## Backend layout

```
backend/app/
  main.py                 app factory, routers, CORS, error handlers
  core/config.py          env settings + config/*.yaml loader
  core/security.py        bcrypt, JWT access/refresh
  core/permissions.py     role -> capability matrix (SPEC Section 7)
  core/deps.py            get_current_user, require_roles, require_capability
  core/audit.py           record_audit + snapshot (secrets/geometry stripped)
  core/errors.py          {"error": {code, message, details}} envelope
  db/models/              SQLAlchemy 2 + GeoAlchemy2 models (all SPEC Section 6 tables)
  api/                    auth, users, admin_units, audit_log, health,
                          surveys (read), plots, dashboard, search, notifications (alerts),
                          layers (map config), tiles (rio-tiler COG tiles),
                          observations (Sentinel-2 / weather / jobs), missions, demo (inputs/ AOIs)
  services/geo.py         GeoJSON conversion, geodesic area, metric offsets
  services/thresholds.py  health classification from config/thresholds.yaml
  services/scope.py       row-level scope per role (admin / own district / own surveys)
  services/plot_data.py   latest AI result / verification per plot, "current survey" rule
  services/stats.py       dashboard aggregates (area-weighted, current surveys only)
  services/satellite/     STAC search (stac.py), SCL-masked NDVI (ndvi.py), refresh pipeline (pipeline.py)
  services/weather.py     Open-Meteo archive + forecast
  services/aoi_io.py      GeoJSON / KML / zipped-shapefile readers (plots, AOIs)
  services/jobs.py        processing_jobs rows + RQ enqueue (or inline)
  seed/seed.py            real boundaries (boundaries_import.py) + demo user accounts
  workers/                RQ queue + jobs
alembic/versions/0001_initial_schema.py
```

## Conventions

- All geometries are EPSG:4326; areas are geodesic (WGS84 ellipsoid), never in degrees.
- Every list endpoint returns `{items, total, page, page_size}`.
- Every error returns `{"error": {"code", "message", "details"}}`.
- AI results (`plot_ai_results`) and human verifications (`plot_verifications`) are separate tables.

## Frontend layout

```
frontend/src/
  app/          api client (token refresh), auth, nav (built pages only), routes (lazy), page titles
                + breadcrumbs, hotkeys, shell/ (NavRail, TopBar, UserMenu, CommandPalette, Shell)
  components/ui Button, Card, Chip/StatusChip, DataTable (sort/filter/paginate/sticky/virtual),
                Dialog, Confirm, Toast, Tabs, Field, Skeleton, EmptyState, Sparkline, Kbd
  components/   MapView, map/ (LayerControl, Legend, Drawer), charts/ (NdviChart, WeatherCharts),
                StatCard, HealthDonut, VerificationFunnel, ChoroplethMap, SurveyMiniMap, AoiDrawMap
  lib/          colors, measure, mapLayers, emptyStates, format (+ node --test unit tests)
  pages/        Login, Dashboard, MapPage, Surveys, SurveyNew, SurveyDetail, Users, AuditLog, Account
e2e/            Playwright QA suite (screenshots to docs/screenshots/)
```

Design tokens live in `tailwind.config.js` (navy brand, single green accent, slate neutrals,
semantic health colours, radius and elevation scales) and `src/index.css`. Inter is bundled
(`@fontsource-variable/inter`); data uses tabular numerals (`.num`).

Map tiles for our own API get the bearer token through MapLibre's `transformRequest`.
Plot labels are HTML markers, so no glyph server is required.
