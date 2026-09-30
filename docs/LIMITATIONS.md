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
- Demo dashboards contain seeded data and are labelled "Demo data".
- AI outputs are decision support only; final decisions require an authorized officer.
- Flights must comply with DGCA rules, Digital Sky restrictions, and the pilot's RPC conditions.

## Demo data (Phase 1)

- Admin boundaries for Pune / Nashik districts, their talukas and villages are
  **simplified rectangles**, not official boundaries. They are flagged `is_demo=true`.
  Replace them with official boundaries (e.g. from MRSAC / Survey of India) before real use.
- The two seeded surveys at "Malegaon Bk (demo)" and their 12 plots x 2 dates of AI results
  are **synthetic** values (`model_version = demo-seed-v0`). They are not model outputs.
- Demo users share one password (`DEMO_PASSWORD`, default `GreenMinds@2026`). Disable
  seeding (`SEED_DEMO_DATA=false`) and deactivate the demo users for any real deployment.

## Decisions taken where the spec was ambiguous

- **Object storage image.** MinIO no longer publishes images on Docker Hub (`minio/minio`
  cannot be pulled). The compose service keeps the name `minio` and the app keeps the
  `MINIO_*` variables, but the default image is **RustFS** (`rustfs/rustfs`), an
  S3-compatible, MinIO-compatible server. Any S3 server image can be used by setting
  `S3_IMAGE`. Storage is not used until Phase 5; the app will talk plain S3 API.
- **Extra columns beyond SPEC Section 6.** `is_demo` was added to admin units, users,
  surveys, plots, rasters and alerts so seeded records can always be badged;
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

- **Sample NDVI raster is synthetic.** Each demo survey gets a generated NDVI COG
  (`DATA_DIR/samples/demo_ndvi_<date>.tif`, 0.5 m, UTM 43N) built by rasterizing the
  seeded plot NDVI values with noise. It is registered with `is_demo=true` and
  `calibrated=false`; the map shows "Demo" and "UNCALIBRATED" badges on it. It is not
  processed imagery. There is no sample orthomosaic yet (Phase 5 adds one).
- **Tiles are served by the backend (rio-tiler)** at
  `/api/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=...&rescale=...&colormap_name=...`,
  the same URL shape as TiTiler. The `url` must match a registered raster in a survey the
  caller can see, so the endpoint cannot read arbitrary files or URLs. TiTiler is kept as an
  optional compose profile (`--profile tiles`, then `TILE_SERVER_URL=http://localhost:8001`).
  TiTiler has no access control of its own; only use it on a trusted network.
- **"Current survey" rule for dashboards.** Surveys are never overwritten, so the same field
  can appear in several dated surveys. Dashboard health / crop / verification figures use
  only the latest processed survey of each area (a processed survey is superseded when a
  later processed survey's AOI intersects it). Total surveyed area is the geodesic area of
  the union of all AOIs, so overlapping surveys are counted once. Percentages are
  area-weighted over analysed plots.
- **"Possible damage %"** is the area-weighted mean of `plot_ai_results.damage_pct`. It stays 0
  until the damage module (Phase 8) writes damage values.
- **Field verifier data scope.** "Assigned plots only" needs a plot-assignment table,
  which arrives with the field app in Phase 7. Until then field verifiers get no survey,
  plot or tile data (404) and no dashboard.
- **Drone operator scope** is "surveys they created". The demo surveys are created by the
  demo operator, so the operator sees them.
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
- **Before/after slider and "Compare surveys"** are Phase 8; the button is shown disabled.

## Open tasks carried forward

- **Phase 5:** test large multi-file uploads (hundreds of 5-10 MB Survey3 images) against the
  RustFS S3 store and record any issues here.
