"""Test fixtures.

Tests run against a real PostGIS database (TEST_DATABASE_URL). The schema is
rebuilt from the Alembic migrations (downgrade to base, upgrade to head) at the
start of the session, so every run also exercises the migrations.
"""
from __future__ import annotations

import os

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://greenminds:greenminds@localhost:5432/greenminds_test",
)
# Must be set before the app (and its engine) is imported.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
import tempfile  # noqa: E402

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="gm-test-data-")
os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest-only-0123456789")

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.seed.seed_demo import DEMO_PASSWORD, seed  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]

ADMIN = "admin@greenminds.demo"
OFFICER = "officer.pune@greenminds.demo"
OPERATOR = "operator@greenminds.demo"
VERIFIER = "verifier@greenminds.demo"


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


@pytest.fixture(scope="session")
def nashik_survey():
    """A processed survey in Nashik created by the admin: outside the Pune
    officer's district and not owned by the drone operator."""
    from geoalchemy2.shape import from_shape
    from shapely.geometry import box
    from sqlalchemy import select

    from app.db.models import District, Survey, SurveyStatus, SurveyType, User

    with SessionLocal() as db:
        nashik = db.scalar(select(District).where(District.name == "Nashik"))
        admin = db.scalar(select(User).where(User.email == ADMIN))
        survey = Survey(
            name="Nashik test survey", type=SurveyType.crop_health, status=SurveyStatus.processed,
            district_id=nashik.id, created_by=admin.id, aoi=from_shape(box(73.98, 20.16, 73.99, 20.17), srid=4326),
            aoi_area_ha=110.0, is_demo=False,
        )
        db.add(survey)
        db.commit()
        return survey.id


def latest_demo_survey_id(client: TestClient, headers: dict[str, str]) -> str:
    """Newest seeded demo survey visible to the caller (other tests add surveys)."""
    items = client.get("/api/surveys?page_size=500", headers=headers).json()["items"]
    return next(s["id"] for s in items if s["is_demo"])
