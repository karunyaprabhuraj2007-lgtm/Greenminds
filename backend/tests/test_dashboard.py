import uuid

from sqlalchemy import select

from app.db.models import District, Taluka
from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header


def test_state_summary_uses_real_rows(client, tokens, world, satellite_world):
    body = client.get("/api/dashboard/summary", headers=auth_header(tokens, ADMIN)).json()
    cards = body["cards"]
    assert cards["surveys_total"] >= 3 and cards["active_surveys"] >= 3 and cards["completed_surveys"] == 0
    # Two dated surveys of the same field: only the latest survey's 4 plots count.
    assert cards["plots_mapped"] == 4 and abs(cards["plots_area_ha"] - 4.32) < 0.02
    assert cards["pending_verifications"] == 4 and cards["field_verifications"] == 0
    assert cards["last_clear_satellite_date"] == "2026-06-10"
    assert cards["satellite_monitored_surveys"] >= 1
    assert body["contains_demo"] is False and body["empty"] is False
    assert body["crop_distribution"] == []  # no AI crop results exist
    assert [f["stage"] for f in body["verification_funnel"]] == ["plots_mapped", "field_verified", "confirmed"]


def test_health_from_latest_clear_sentinel2_ndvi(client, tokens, world, satellite_world):
    body = client.get("/api/dashboard/summary", headers=auth_header(tokens, OFFICER)).json()
    health = {h["health_class"]: h for h in body["health"]}
    # P-001 NDVI 0.33 (moderate); P-002..P-004 NDVI 0.71 (healthy); equal areas.
    assert health["healthy"]["plots"] == 3 and health["moderate"]["plots"] == 1 and health["severe"]["plots"] == 0
    assert body["cards"]["healthy_pct"] == 75.0 and body["cards"]["stress_pct"] == 25.0
    assert body["health_basis"]["source"] == "Sentinel-2 L2A"
    # The east-half plots were cloud-free again on 20 Jul (west half cloudy),
    # so their latest clear observation - and the basis date - is 20 Jul.
    assert body["health_basis"]["as_of"] == "2026-07-20"


def test_trends_are_monthly_counts(client, tokens, world):
    trends = client.get("/api/dashboard/summary", headers=auth_header(tokens, ADMIN)).json()["trends"]
    assert len(trends["surveys_per_month"]) == 12
    assert trends["surveys_per_month"][-1]["value"] >= 3
    assert len(trends["ndvi_monthly_mean"]) == 12


def test_empty_scope_has_no_numbers(client, tokens, db):
    akola = db.scalar(select(District).where(District.name == "Akola"))
    body = client.get(f"/api/dashboard/summary?level=district&id={akola.id}", headers=auth_header(tokens, ADMIN)).json()
    assert body["empty"] is True
    assert body["cards"]["surveys_total"] == 0 and body["cards"]["plots_mapped"] == 0
    assert body["cards"]["healthy_pct"] is None and body["cards"]["last_clear_satellite_date"] is None
    assert body["health"] == [] and body["crop_distribution"] == []
    assert all(c["surveys"] == 0 for c in body["children"])


def test_drilldown_levels(client, tokens, db, world):
    h = auth_header(tokens, OFFICER)
    pune = db.scalar(select(District).where(District.name == "Pune"))
    baramati = db.scalar(select(Taluka).where(Taluka.name == "Baramati"))
    d = client.get(f"/api/dashboard/summary?level=district&id={pune.id}", headers=h).json()
    assert d["unit"]["name"] == "Pune" and d["unit"]["geometry"]["type"] == "MultiPolygon"
    child = next(c for c in d["children"] if c["name"] == "Baramati")
    assert child["surveys"] == 2 and child["plots_mapped"] == 4
    t = client.get(f"/api/dashboard/summary?level=taluka&id={baramati.id}", headers=h).json()
    assert [c["level"] for c in t["children"]] == ["survey", "survey"]
    assert t["children"][0]["survey_date"] > t["children"][1]["survey_date"]
    assert [(p["level"], p["name"]) for p in t["path"]] == [("district", "Pune"), ("taluka", "Baramati")]


def test_officer_cannot_open_other_district(client, tokens, db):
    nashik = db.scalar(select(District).where(District.name == "Nashik"))
    assert client.get(f"/api/dashboard/summary?level=district&id={nashik.id}", headers=auth_header(tokens, OFFICER)).status_code == 403
    state = client.get("/api/dashboard/summary", headers=auth_header(tokens, OFFICER)).json()
    assert [c["name"] for c in state["children"]] == ["Pune"]


def test_summary_validation_and_permissions(client, tokens):
    assert client.get("/api/dashboard/summary?level=district", headers=auth_header(tokens, ADMIN)).status_code == 400
    assert client.get(f"/api/dashboard/summary?level=taluka&id={uuid.uuid4()}", headers=auth_header(tokens, ADMIN)).status_code == 404
    assert client.get("/api/dashboard/summary", headers=auth_header(tokens, VERIFIER)).status_code == 403
    assert client.get("/api/dashboard/summary", headers=auth_header(tokens, OPERATOR)).status_code == 200
