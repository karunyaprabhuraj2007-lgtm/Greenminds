#!/bin/sh
# Apply migrations, seed demo data (idempotent) and start the API.
set -e
alembic upgrade head
if [ "${SEED_DEMO_DATA:-true}" = "true" ]; then
  python -m app.seed.seed
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 ${UVICORN_EXTRA_ARGS:-}
