# GreenMinds Crop Intelligence Platform

Drone-first geospatial crop survey and decision-support platform for Maharashtra
agriculture (Rehydria Technology Pvt. Ltd.).

`Define area -> Plan mission -> Fly -> Upload -> Process -> Plot intelligence -> Field verification -> Reports`

- Full requirements: [SPEC.md](SPEC.md). Working rules: [CLAUDE.md](CLAUDE.md).
- Architecture as built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Known limitations and decisions: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

> AI outputs are decision support only. Final administrative decisions are made by
> authorized officers. Seeded demo data is always labelled "Demo data".

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: compose, PostGIS schema + Alembic, JWT + RBAC, audit log, demo seed, app shell | **Done** |
| 2 | GIS map dashboard: MapLibre map, layers, plot panel, cards, search, drill-down, sample NDVI COG | **Done** |
| 3 | New survey + flight planner | Not started |
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

The GIS map opens on the most recent processed survey. Click a plot to open its panel;
use the breadcrumbs or the dashboard table to drill down State > District > Taluka >
Village > Survey > Plot.

Optional services: `docker compose --profile odm --profile sim up` (NodeODM
photogrammetry from Phase 5, ArduPilot SITL from Phase 4) and `--profile tiles` (TiTiler;
by default COG tiles are served by the backend with the same URL shape).

On start the backend runs the Alembic migrations and an idempotent demo seed.

### Demo accounts (demo only)

All demo accounts use the password `GreenMinds@2026` (set `DEMO_PASSWORD` to change it,
`SEED_DEMO_DATA=false` to skip seeding). Never use these in a real deployment.

| Role | Email | Sees |
|---|---|---|
| State Admin | admin@greenminds.demo | everything, users, audit log |
| District Officer (Pune) | officer.pune@greenminds.demo | own district; authorize missions; final decisions |
| Drone Operator | operator@greenminds.demo | surveys, missions, live flight, uploads, own reports |
| Field Verifier | verifier@greenminds.demo | field verification app, assigned plots |

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

# frontend: unit tests (node --test, known-answer geometry tests), type-check + build
cd frontend && npm test && npm run build
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
| `config/map.yaml` | Crop order (fixes each crop's map colour), raster styles (rescale, colormap), initial view |

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
| `TILE_SERVER_URL` | `/api/tiles` | COG tile service base (backend rio-tiler; or a TiTiler URL) |
| `DATA_DIR` | `/data` (compose volume) | Local data such as the generated sample NDVI COGs |
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
