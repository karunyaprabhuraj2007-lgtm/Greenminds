"""Test fixtures.

Tests run against a real PostGIS database (TEST_DATABASE_URL). The schema is
rebuilt from the Alembic migrations (downgrade to base, upgrade to head) at the
start of the session, so every run also exercises the migrations. The start-up
seed loads the real Maharashtra boundaries and the demo user accounts.

Survey / plot data used by tests is created through the API in the `world`
fixture, exactly as an officer or operator would create it.
"""
from __future__ import annotations

import os
import tempfile

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://greenminds:greenminds@localhost:5432/greenminds_test",
)
# Must be set before the app (and its engine) is imported.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="gm-test-data-")
os.environ["JOBS_INLINE"] = "true"
os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest-only-0123456789")

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.seed.seed import DEMO_PASSWORD, seed  # noqa: E402
from app.services.geo import offset_lonlat  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]

ADMIN = "admin@greenminds.demo"
OFFICER = "officer.pune@greenminds.demo"
OPERATOR = "operator@greenminds.demo"
VERIFIER = "verifier@greenminds.demo"

# A field inside the real Baramati taluka boundary.
FIELD_ORIGIN = (74.4521, 18.2194)


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["database_url"] = TEST_DATABASE_URL
    return cfg


@pytest.fixture(scope="session", autouse=True)
def database() -> None:
    cfg = _alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    with SessionLocal() as db:
        seed(db)


@pytest.fixture()
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


def login(client: TestClient, email: str, password: str = DEMO_PASSWORD) -> dict:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture(scope="session")
def tokens(client: TestClient) -> dict[str, dict]:
    return {email: login(client, email) for email in (ADMIN, OFFICER, OPERATOR, VERIFIER)}


def auth_header(tokens: dict[str, dict], email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens[email]['access_token']}"}


def rect(origin: tuple[float, float], east_m: float, north_m: float, w: float, h: float) -> dict:
    """GeoJSON polygon of a w x h metre rectangle offset from `origin`."""
    lon, lat = origin
    corners = [(east_m, north_m), (east_m + w, north_m), (east_m + w, north_m + h), (east_m, north_m + h), (east_m, north_m)]
    return {"type": "Polygon", "coordinates": [[list(offset_lonlat(lon, lat, e, n)) for e, n in corners]]}


def unit_ids(db, district: str, taluka: str | None = None) -> dict[str, str | None]:
    from app.db.models import District, Taluka

    d = db.scalar(select(District).where(District.name == district))
    t = db.scalar(select(Taluka).where(Taluka.name == taluka, Taluka.district_id == d.id)) if taluka else None
    return {"district_id": str(d.id), "taluka_id": str(t.id) if t else None}


@pytest.fixture(scope="session")
def world(client, tokens) -> dict:
    """Two dated surveys of the same Baramati field (operator-owned, with drawn
    plots) and one Nashik survey owned by the admin."""
    h_op = auth_header(tokens, OPERATOR)
    h_admin = auth_header(tokens, ADMIN)
    with SessionLocal() as db:
        pune = unit_ids(db, "Pune", "Baramati")
        nashik = unit_ids(db, "Nashik", "Niphad")
    aoi = rect(FIELD_ORIGIN, 0, 0, 420, 300)
    out: dict = {"aoi": aoi}
    for key, day in (("old", "2026-07-15"), ("new", "2026-08-20")):
        res = client.post("/api/surveys", headers=h_op, json={
            "name": f"Baramati field {day}", "type": "crop_health", **pune, "aoi": aoi, "survey_date": day,
            "season": "Kharif 2026"})
        assert res.status_code == 201, res.text
        sid = res.json()["id"]
        codes = []
        for i in range(4):
            geom = rect(FIELD_ORIGIN, 10 + i * 100, 10, 90, 120)
            r = client.post(f"/api/surveys/{sid}/plots", headers=h_op, json={"geometry": geom, "parcel_ref": f"Gat {101 + i}"})
            assert r.status_code == 201, r.text
            codes.append(r.json())
        out[key] = {"id": sid, "plots": codes}
    res = client.post("/api/surveys", headers=h_admin, json={
        "name": "Niphad test survey", "type": "crop_survey", **nashik,
        "aoi": rect((74.1169, 20.0809), 0, 0, 300, 300), "survey_date": "2026-08-01"})
    assert res.status_code == 201, res.text
    out["nashik"] = res.json()["id"]
    return out


@pytest.fixture(scope="session")
def satellite_world(client, tokens, world) -> dict:
    """Run the Sentinel-2 refresh for the newest Baramati survey against the
    recorded STAC fixture (see tests/satellite_fixture.py)."""
    import httpx

    from app.core.config import get_settings
    from app.services.satellite import pipeline
    from tests.satellite_fixture import stac_transport, write_scene_rasters

    folder = Path(get_settings().data_dir) / "stac-fixture"
    plot = client.get(f"/api/plots/{world['new']['plots'][0]['id']}", headers=auth_header(tokens, OPERATOR)).json()
    write_scene_rasters(folder, world["aoi"], plot["geometry"])
    requests: list = []
    original = pipeline.http_client_factory
    pipeline.http_client_factory = lambda: httpx.Client(transport=stac_transport(folder, requests))
    res = client.post(f"/api/surveys/{world['new']['id']}/satellite/refresh", headers=auth_header(tokens, OPERATOR))
    pipeline.http_client_factory = original
    assert res.status_code == 200, res.text
    return {"refresh": res.json(), "requests": requests, "folder": folder}
