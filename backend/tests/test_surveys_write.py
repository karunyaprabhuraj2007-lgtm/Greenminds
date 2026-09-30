import pytest
from sqlalchemy import select

from app.db.models import AuditLog, District, Taluka, Village
from app.services.geo import offset_lonlat
from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header


def square(lon, lat, side_m):
    pts = [offset_lonlat(lon, lat, e, n) for e, n in [(0, 0), (side_m, 0), (side_m, side_m), (0, side_m), (0, 0)]]
    return {"type": "Polygon", "coordinates": [[list(p) for p in pts]]}


@pytest.fixture()
def units(db):
    return {
        "pune": db.scalar(select(District).where(District.name == "Pune")),
        "nashik": db.scalar(select(District).where(District.name == "Nashik")),
        "baramati": db.scalar(select(Taluka).where(Taluka.name == "Baramati")),
        "indapur": db.scalar(select(Taluka).where(Taluka.name == "Indapur")),
        "malegaon": db.scalar(select(Village).where(Village.name == "Malegaon Bk (demo)")),
    }


def _body(units, **kw):
    body = {
        "name": "Test field survey",
        "type": "crop_health",
        "district_id": str(units["pune"].id),
        "taluka_id": str(units["baramati"].id),
        "village_id": str(units["malegaon"].id),
        "aoi": square(74.53, 18.14, 100),
        "survey_date": "2026-10-05",
        "season": "Rabi 2026",
    }
    body.update(kw)
    return body


def test_create_survey_computes_area_and_is_audited(client, tokens, units, db):
    res = client.post("/api/surveys", json=_body(units), headers=auth_header(tokens, OPERATOR))
    assert res.status_code == 201, res.text
    s = res.json()
    assert s["status"] == "draft" and s["is_demo"] is False
    assert s["aoi_area_ha"] == pytest.approx(1.0, rel=2e-3)  # 100 m x 100 m
    assert s["village_name"] == "Malegaon Bk (demo)" and s["warnings"] == []
    row = db.scalar(select(AuditLog).where(AuditLog.entity == "survey", AuditLog.entity_id == s["id"]))
    assert row.action == "create"
    # Operator owns it, so it shows up in their list.
    names = [x["id"] for x in client.get("/api/surveys", headers=auth_header(tokens, OPERATOR)).json()["items"]]
    assert s["id"] in names


def test_aoi_outside_village_gives_warning(client, tokens, units):
    res = client.post("/api/surveys", json=_body(units, aoi=square(74.70, 18.20, 200)), headers=auth_header(tokens, OFFICER))
    assert res.status_code == 201
    assert "not fully inside the selected village" in res.json()["warnings"][0]


def test_invalid_aoi_rejected(client, tokens, units):
    h = auth_header(tokens, OFFICER)
    bowtie = {"type": "Polygon", "coordinates": [[[74.5, 18.1], [74.51, 18.11], [74.51, 18.1], [74.5, 18.11], [74.5, 18.1]]]}
    assert client.post("/api/surveys", json=_body(units, aoi=bowtie), headers=h).status_code == 422
    assert client.post("/api/surveys", json=_body(units, aoi={"type": "Point", "coordinates": [74.5, 18.1]}), headers=h).status_code == 422
    huge = square(74.53, 18.14, 6000)  # 3600 ha > 2000 ha limit
    res = client.post("/api/surveys", json=_body(units, aoi=huge), headers=h)
    assert res.status_code == 422 and "maximum" in res.json()["error"]["message"]


def test_unit_hierarchy_validated(client, tokens, units):
    h = auth_header(tokens, ADMIN)
    bad_taluka = _body(units, district_id=str(units["nashik"].id))
    assert client.post("/api/surveys", json=bad_taluka, headers=h).status_code == 400
    bad_village = _body(units, taluka_id=str(units["indapur"].id))
    assert client.post("/api/surveys", json=bad_village, headers=h).status_code == 400


def test_officer_limited_to_own_district(client, tokens, units):
    body = _body(units, district_id=str(units["nashik"].id), taluka_id=None, village_id=None)
    assert client.post("/api/surveys", json=body, headers=auth_header(tokens, OFFICER)).status_code == 403
    assert client.post("/api/surveys", json=body, headers=auth_header(tokens, ADMIN)).status_code == 201


def test_verifier_cannot_create(client, tokens, units):
    assert client.post("/api/surveys", json=_body(units), headers=auth_header(tokens, VERIFIER)).status_code == 403


def test_update_survey_and_aoi(client, tokens, units, db):
    h = auth_header(tokens, OFFICER)
    sid = client.post("/api/surveys", json=_body(units), headers=h).json()["id"]
    res = client.patch(f"/api/surveys/{sid}", json={"name": "Renamed", "aoi": square(74.53, 18.14, 200)}, headers=h)
    assert res.status_code == 200
    assert res.json()["name"] == "Renamed"
    assert res.json()["aoi_area_ha"] == pytest.approx(4.0, rel=2e-3)
    rows = db.scalars(select(AuditLog).where(AuditLog.entity_id == sid).order_by(AuditLog.at)).all()
    assert [r.action for r in rows] == ["create", "update"]
    assert rows[1].before_json["aoi_area_ha"] == pytest.approx(1.0, rel=2e-3)


def test_flown_survey_aoi_is_frozen_and_status_rules(client, tokens):
    h = auth_header(tokens, ADMIN)
    demo = client.get("/api/surveys", headers=h).json()["items"]
    processed = next(s for s in demo if s["status"] == "processed")
    res = client.patch(f"/api/surveys/{processed['id']}", json={"aoi": square(74.53, 18.14, 100)}, headers=h)
    assert res.status_code == 409
    assert client.patch(f"/api/surveys/{processed['id']}", json={"status": "processing"}, headers=h).status_code == 400
    # Notes can still be edited on a processed survey.
    assert client.patch(f"/api/surveys/{processed['id']}", json={"notes": processed["notes"]}, headers=h).status_code == 200


def test_archive_survey(client, tokens, units):
    h = auth_header(tokens, OFFICER)
    sid = client.post("/api/surveys", json=_body(units), headers=h).json()["id"]
    res = client.patch(f"/api/surveys/{sid}", json={"status": "archived"}, headers=h)
    assert res.status_code == 200 and res.json()["status"] == "archived"


def test_update_not_visible_is_404(client, tokens, nashik_survey):
    res = client.patch(f"/api/surveys/{nashik_survey}", json={"name": "x"}, headers=auth_header(tokens, OFFICER))
    assert res.status_code == 404
