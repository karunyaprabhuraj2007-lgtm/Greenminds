# GreenMinds Crop Intelligence Platform

Drone-first geospatial crop survey and decision-support platform for Maharashtra
agriculture (Rehydria Technology Pvt. Ltd.).

`Define area -> Plan mission -> Fly -> Upload -> Process -> Plot intelligence -> Field verification -> Reports`

- Full requirements: [SPEC.md](SPEC.md). Working rules: [CLAUDE.md](CLAUDE.md).
- Architecture as built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Known limitations and decisions: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

> AI and satellite outputs are decision support only. Final administrative decisions are
> made by authorized officers. No survey or dashboard data is seeded: every number comes
> from the database or from the external datasets listed below.

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: compose, PostGIS schema + Alembic, JWT + RBAC, audit log, demo seed, app shell | **Done** |
| 2 | GIS map dashboard: MapLibre map, layers, plot panel, cards, search, drill-down | **Done** |
| 2B | Real data (geoBoundaries, Sentinel-2 NDVI, Open-Meteo, plot import/drawing), no seeded data, UI redesign, Playwright QA | **Done** |
| 3 | New survey + flight planner | **In progress**: survey CRUD, AOI wizard, pre-flight checklist + authorization done; planner / exports wait for `greenminds_core_modules` |
| 4 | Telemetry + live mission | Not started |
| 5 | Upload + processing | Not started |
| 6 | Indices, plots, classification | Not started |
| 7 | Field verification PWA | Not started |
| 8 | Damage / insurance / subsidy, reports, polish | Not started |

## Run it

Requirements: Docker with the compose plugin.

```bash
cp .env.example .env        # optional; compose has safe local defaults
docker compose up --build   # core platform
```

Then open:

| URL | What |
|---|---|
| http://localhost:5173 | Web app |
| http://localhost:8000/docs | API docs (OpenAPI) |
| http://localhost:9001 | Object storage console |

A fresh installation has real Maharashtra district and taluka boundaries and no surveys.
Typical flow:

1. **New survey** — pick district / taluka, draw the field (or use a polygon from `inputs/`,
   or load a GeoJSON file).
2. **Plots** — draw plots on the GIS map (*Draw plot*) or import GeoJSON / KML / a zipped
   shapefile on the survey's *Plots* tab. Plot boundaries are never generated automatically.
3. **Sentinel-2** tab — *Fetch Sentinel-2*: last 12 months of L2A scenes, SCL cloud mask,
   NDVI per date for the area and each plot; the latest clear date becomes a map layer.
4. **Weather** tab — *Fetch weather*: 90 days of rain / temperature plus a 7-day forecast.
5. **Dashboard / GIS map** — drill down State > District > Taluka > Survey > Plot.
   Press **Ctrl/⌘ K** to search anything, **?** for shortcuts.

The Sentinel-2 and weather fetches need outbound HTTPS to `earth-search.aws.element84.com`,
`sentinel-cogs.s3.us-west-2.amazonaws.com`, `archive-api.open-meteo.com` and
`api.open-meteo.com` (and the basemap tile hosts for the map background).

Optional services: `docker compose --profile odm --profile sim up` (NodeODM
photogrammetry from Phase 5, ArduPilot SITL from Phase 4) and `--profile tiles` (TiTiler;
by default COG tiles are served by the backend with the same URL shape).

On start the backend runs the Alembic migrations and an idempotent load of the real
boundaries (from the committed `backend/app/seed/boundaries/`, rebuilt with
`tools/boundaries/fetch_geoboundaries.py`) plus the demo user accounts.

### Data sources

| Data | Source | Licence |
|---|---|---|
| Districts (36) and talukas (357) | geoBoundaries gbOpen IND ADM2 / ADM3 (Pathways Data, lgdirectory.gov.in) | ODbL 1.0 |
| NDVI time series and layer | Copernicus Sentinel-2 L2A via Element 84 Earth Search STAC | Copernicus Sentinel data terms |
| Rain and temperature | Open-Meteo archive + forecast | CC BY 4.0 |
| Basemap | OpenStreetMap (light) / CARTO (dark), configurable | OSM ODbL; tile policies apply |

Details, caveats and what is not real: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

### Demo accounts (demo only)

All demo accounts use the password `GreenMinds@2026` (set `DEMO_PASSWORD` to change it,
`SEED_DEMO_DATA=false` to skip creating them). They are labelled "Demo account" in the UI.
Never use these in a real deployment.

| Role | Email | Sees |
|---|---|---|
| State Admin | admin@greenminds.demo | everything, users, audit log |
| District Officer (Pune) | officer.pune@greenminds.demo | own district; authorize missions; final decisions |
| Drone Operator | operator@greenminds.demo | own surveys, plots, Sentinel-2 / weather refresh |
| Field Verifier | verifier@greenminds.demo | account page only until plot assignments / field app (Phase 7) |

## Development without Docker

Backend (Python 3.11, needs PostgreSQL 16 + PostGIS 3 and Redis):

```bash
cd backend
python3.11 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
export DATABASE_URL=postgresql+psycopg://greenminds:greenminds@localhost:5432/greenminds
alembic upgrade head
python -m app.seed.seed_demo
uvicorn app.main:app --reload
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to http://localhost:8000
```

## Tests

```bash
# inside compose (uses the greenminds_test database created on first db start)
docker compose run --rm backend pytest

# or locally, against any PostGIS database you can drop/recreate tables in
cd backend && TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/greenminds_test pytest

# frontend: unit tests (node --test: geometry known answers, colours, empty-state logic), type-check + build
cd frontend && npm test && npm run build

# end-to-end QA against a running stack (fresh database recommended):
# logs in as every role, creates a survey and plots through the UI, writes docs/screenshots/*.png
cd frontend && npx playwright test          # E2E_BASE_URL, PLAYWRIGHT_CHROMIUM_PATH optional
```

The test session rebuilds the schema from the Alembic migrations (downgrade to base,
upgrade to head), so migrations are exercised on every run.

## Configuration

Operational values live in env vars (`.env.example`) and YAML under `config/`:

| File | Contents |
|---|---|
| `config/cameras.yaml` | Survey camera profiles (MAPIR Survey3W/3N). **Defaults must be verified against the MAPIR datasheet and a bench test, including `band_map`.** |
| `config/aircraft.yaml` | Aircraft speed / endurance / safety factor for the flight planner |
| `config/thresholds.yaml` | Indicative NDVI health, damage, classification and plot thresholds |
| `config/preflight.yaml` | Pre-flight checklist items (SPEC Section 9); `telemetry` marks items auto-filled from telemetry in Phase 4 |
| `inputs/` | Your real field polygon (`.geojson` / `.kml`), offered as the default demo AOI in the New Survey wizard |
| `config/satellite.yaml` | Sentinel-2 STAC URL, collection, asset keys, SCL clear classes, cloud limits, cache interval |
| `config/weather.yaml` | Open-Meteo URLs, history / forecast days, archive lag, timezone |
| `config/map.yaml` | Crop order (fixes each crop's map colour), raster styles (NDVI uses the colour-blind-safe YlGn ramp), initial view |

Key environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://greenminds:greenminds@db:5432/greenminds` | PostGIS connection |
| `JWT_SECRET` | dev value | **Set a long random value** for any shared deployment |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | 30 / 7 | Token lifetimes |
| `SEED_DEMO_DATA`, `DEMO_MODE`, `DEMO_PASSWORD` | true / true / `GreenMinds@2026` | Demo data |
| `REDIS_URL` | `redis://redis:6379/0` | Job queue |
| `S3_IMAGE` | `rustfs/rustfs:latest` | S3 server image (MinIO images are no longer on Docker Hub) |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` | local values | Object storage |
| `BASEMAP_DARK_TILES_URL`, `BASEMAP_DARK_ATTRIBUTION` | CARTO dark | Dark basemap (toggle on the map) |
| `JOBS_INLINE` | `false` | Run background jobs in the API process instead of the RQ worker |
| `TILE_SERVER_URL` | `/api/tiles` | COG tile service base (backend rio-tiler; or a TiTiler URL) |
| `INPUTS_DIR` | `/inputs` (compose mounts `./inputs`) | Folder scanned for the default demo AOI |
| `DATA_DIR` | `/data` (compose volume) | Generated rasters, e.g. the latest clear Sentinel-2 NDVI COG per survey |
| `BASEMAP_TILES_URL`, `BASEMAP_ATTRIBUTION` | OpenStreetMap | XYZ basemap (use your own tile server in production) |
| `SATELLITE_TILES_URL`, `SATELLITE_ATTRIBUTION` | empty (off) | Optional satellite context layer |
| `TITILER_URL`, `NODEODM_URL` | local URLs | Optional TiTiler / photogrammetry |
| `VIDEO_SOURCE_URL`, `MEDIAMTX_*` | - | Live video relay |
| `TELEMETRY_MODE` | `replay` | `live`, `sitl` or `replay` |
| `MAVLINK_URL` | `udp:0.0.0.0:14550` | MAVLink link, e.g. `serial:/dev/ttyUSB0:57600` |
| `CAMERA_PROFILE`, `AIRCRAFT_PROFILE` | `survey3w_rgn`, `agroscan_quad` | Profile keys in `config/*.yaml` |

## API conventions

- Auth: `POST /api/auth/login` -> access + refresh JWT; `POST /api/auth/refresh`; `GET /api/auth/me`
  (includes the caller's capabilities, which drive the role-aware menu).
- Lists return `{items, total, page, page_size}` (`?page=&page_size=`).
- Errors return `{"error": {"code", "message", "details"}}`.
- Every mutating request writes an `audit_log` row (`GET /api/audit-log`, state admin only).

## Hardware notes

Camera trigger wiring and ArduPilot camera-trigger parameters differ by firmware version;
the operator must verify them on the bench. See SPEC.md Section 20 for the hardware
checks that must be done in person.

## Demo script

Written in Phase 8 at `docs/DEMO_SCRIPT.md` (outline in SPEC.md Section 21).
