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
