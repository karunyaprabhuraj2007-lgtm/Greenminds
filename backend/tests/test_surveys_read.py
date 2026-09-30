import uuid

from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header


def _ids(client, tokens, email, qs=""):
    res = client.get(f"/api/surveys{qs}", headers=auth_header(tokens, email))
    assert res.status_code == 200
    return [s["id"] for s in res.json()["items"]]


def test_scope_by_role(client, tokens, world):
    admin = _ids(client, tokens, ADMIN)
    assert {world["old"]["id"], world["new"]["id"], world["nashik"]} <= set(admin)
    officer = _ids(client, tokens, OFFICER)
    assert world["nashik"] not in officer and world["new"]["id"] in officer
    operator = _ids(client, tokens, OPERATOR)
    assert world["nashik"] not in operator and world["old"]["id"] in operator  # own surveys
    assert _ids(client, tokens, VERIFIER) == []


def test_list_is_newest_first_and_filterable(client, tokens, world):
    h = auth_header(tokens, OFFICER)
    items = client.get("/api/surveys", headers=h).json()["items"]
    mine = [s for s in items if s["id"] in (world["old"]["id"], world["new"]["id"])]
    assert mine[0]["survey_date"] > mine[1]["survey_date"]
    assert mine[0]["district_name"] == "Pune" and mine[0]["taluka_name"] == "Baramati"
    assert mine[0]["plot_count"] == 4 and mine[0]["is_demo"] is False
    district_id = mine[0]["district_id"]
    filtered = client.get(f"/api/surveys?district_id={district_id}", headers=h).json()["items"]
    assert {s["district_id"] for s in filtered} == {district_id}
    assert client.get("/api/surveys?status=processed", headers=h).json()["total"] == 0


def test_get_survey_with_aoi(client, tokens, world):
    body = client.get(f"/api/surveys/{world['new']['id']}", headers=auth_header(tokens, OFFICER)).json()
    assert body["aoi"]["type"] == "Polygon"
    assert abs(body["aoi_area_ha"] - 12.6) < 0.05  # 420 m x 300 m


def test_survey_not_visible_is_404(client, tokens, world):
    assert client.get(f"/api/surveys/{world['nashik']}", headers=auth_header(tokens, OFFICER)).status_code == 404
    assert client.get(f"/api/surveys/{uuid.uuid4()}", headers=auth_header(tokens, ADMIN)).status_code == 404


def test_survey_plots_geojson(client, tokens, world):
    fc = client.get(f"/api/surveys/{world['new']['id']}/plots", headers=auth_header(tokens, OFFICER)).json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == 4
    props = fc["features"][0]["properties"]
    assert props["plot_code"] == "P-001" and props["parcel_ref"] == "Gat 101"
    assert props["verification_status"] == "ai_only" and props["has_ai_result"] is False
    assert props["is_demo"] is False and props["source"] == "drawn"
    assert fc["features"][0]["geometry"]["type"] == "Polygon"


def test_survey_rasters_empty_until_satellite_refresh(client, tokens, world):
    rasters = client.get(f"/api/surveys/{world['old']['id']}/rasters", headers=auth_header(tokens, OFFICER)).json()
    assert rasters == []


def test_survey_stats(client, tokens, world):
    stats = client.get(f"/api/surveys/{world['new']['id']}/stats", headers=auth_header(tokens, ADMIN)).json()
    assert stats["survey_id"] == world["new"]["id"]
    assert stats["cards"]["plots_mapped"] == 4
    assert stats["crop_distribution"] == []  # no AI crop results exist


def test_surveys_require_auth(client):
    assert client.get("/api/surveys").status_code == 401
