# Architecture

See SPEC.md Section 3 for the target diagram. This file tracks what is actually built.

## Services (docker compose)

| Service | Purpose | Status |
|---|---|---|
| db | PostgreSQL 16 + PostGIS 3.4 | Phase 1 |
| redis | RQ job queue | Phase 1 (queue wired, jobs from Phase 5) |
| minio | S3-compatible object storage (RustFS image by default, see LIMITATIONS) | running, used from Phase 5 |
| backend | FastAPI API; runs Alembic migrations + demo seed on start | Phase 1 |
| worker | RQ worker (`greenminds` queue) | Phase 1 (no jobs yet) |
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
                          layers (map config), tiles (rio-tiler COG tiles)
  services/geo.py         GeoJSON conversion, geodesic area, metric offsets
  services/thresholds.py  health classification from config/thresholds.yaml
  services/scope.py       row-level scope per role (admin / own district / own surveys)
  services/plot_data.py   latest AI result / verification per plot, "current survey" rule
  services/stats.py       dashboard aggregates (area-weighted, current surveys only)
  services/sample_data.py synthetic NDVI COG writer for the demo surveys
  seed/seed_demo.py       idempotent demo seed (everything is_demo=true)
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
  app/          api client (token refresh), auth context, nav (capability-driven), routes, types
  lib/          colors (fixed categorical order, status, ramps), measure (geodesic), mapLayers, format
  components/   MapView, LayerPanel, PlotPanel, TimelineChart, SearchBar, StatCards, HealthDonut,
                CropTable, VerificationFunnel, ChoroplethMap, AlertsFeed, DemoBadge, Sidebar, TopBar
  pages/        Dashboard, GisMap, Users, AuditLog, Settings, Login, PhasePlaceholder
```

Map tiles for our own API get the bearer token through MapLibre's `transformRequest`.
Plot and unit labels are HTML markers, so no glyph server is required.
