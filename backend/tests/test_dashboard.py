import uuid

from sqlalchemy import select

from app.db.models import District, Taluka, Village
from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header


def test_state_summary_counts_current_surveys_only(client, tokens, nashik_survey):
    res = client.get("/api/dashboard/summary", headers=auth_header(tokens, ADMIN))
    assert res.status_code == 200
    body = res.json()
    cards = body["cards"]
    # Two dated surveys of the same 12 plots: only the latest one counts.
    assert cards["fields_analysed"] == 12
    assert cards["completed_surveys"] == 3  # 2 demo + Nashik test survey
    assert cards["pending_verifications"] == 12
    assert body["contains_demo"] is True
    assert {c["name"] for c in body["children"]} == {"Pune", "Nashik"}
    assert sum(r["plots"] for r in body["health"]) == 12
    assert abs(sum(r["pct"] for r in body["crop_distribution"]) - 100) < 0.5
    assert [f["stage"] for f in body["verification_funnel"]] == ["ai_analysed", "field_verified", "confirmed"]


def test_healthy_pct_is_area_weighted(client, tokens):
    body = client.get("/api/dashboard/summary", headers=auth_header(tokens, OFFICER)).json()
    healthy = next(r for r in body["health"] if r["health_class"] == "healthy")
    expected = round(100 * healthy["area_ha"] / body["cards"]["analysed_area_ha"], 1)
    assert body["cards"]["healthy_pct"] == expected


def test_drilldown_levels(client, tokens, db):
    h = auth_header(tokens, OFFICER)
    pune = db.scalar(select(District).where(District.name == "Pune"))
    baramati = db.scalar(select(Taluka).where(Taluka.name == "Baramati"))
    village = db.scalar(select(Village).where(Village.name == "Malegaon Bk (demo)"))
    d = client.get(f"/api/dashboard/summary?level=district&id={pune.id}", headers=h).json()
    assert d["unit"]["name"] == "Pune" and {c["name"] for c in d["children"]} == {"Baramati", "Indapur"}
    t = client.get(f"/api/dashboard/summary?level=taluka&id={baramati.id}", headers=h).json()
    assert [c["name"] for c in t["children"]] == ["Malegaon Bk (demo)"]
    assert t["children"][0]["fields_analysed"] == 12
    v = client.get(f"/api/dashboard/summary?level=village&id={village.id}", headers=h).json()
    assert [c["level"] for c in v["children"]] == ["survey", "survey"]
    assert [(p["level"], p["name"]) for p in v["path"]] == [
        ("district", "Pune"), ("taluka", "Baramati"), ("village", "Malegaon Bk (demo)")]
    assert v["children"][0]["survey_date"] > v["children"][1]["survey_date"]


def test_officer_cannot_open_other_district(client, tokens, db):
    nashik = db.scalar(select(District).where(District.name == "Nashik"))
    res = client.get(f"/api/dashboard/summary?level=district&id={nashik.id}", headers=auth_header(tokens, OFFICER))
    assert res.status_code == 403
    state = client.get("/api/dashboard/summary", headers=auth_header(tokens, OFFICER)).json()
    assert [c["name"] for c in state["children"]] == ["Pune"]


def test_summary_validation_and_permissions(client, tokens):
    assert client.get("/api/dashboard/summary?level=district", headers=auth_header(tokens, ADMIN)).status_code == 400
    assert client.get(f"/api/dashboard/summary?level=village&id={uuid.uuid4()}", headers=auth_header(tokens, ADMIN)).status_code == 404
    assert client.get("/api/dashboard/summary", headers=auth_header(tokens, VERIFIER)).status_code == 403
    assert client.get("/api/dashboard/summary", headers=auth_header(tokens, OPERATOR)).status_code == 200
