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

## Repo conventions (added during Phase 1)
- Backend tests: `cd backend && pytest` — needs a PostGIS database at `TEST_DATABASE_URL`
  (default `postgresql+psycopg://greenminds:greenminds@localhost:5432/greenminds_test`).
  Inside compose: `docker compose run --rm backend pytest`.
- Frontend checks: `cd frontend && npm test && npm run typecheck && npm run build` (`npm test` = `node --test`, no extra deps).
- Schema changes go through Alembic migrations in `backend/alembic/versions/`.
- Ambiguities and simplifications are recorded in `docs/LIMITATIONS.md`.
