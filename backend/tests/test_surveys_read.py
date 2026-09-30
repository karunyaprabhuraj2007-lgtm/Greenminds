import uuid

from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header


def _names(client, tokens, email, qs=""):
    res = client.get(f"/api/surveys{qs}", headers=auth_header(tokens, email))
    assert res.status_code == 200
    return [s["name"] for s in res.json()["items"]]


def test_scope_by_role(client, tokens, nashik_survey):
    admin = _names(client, tokens, ADMIN)
    assert "Nashik test survey" in admin and len(admin) >= 3
    officer = _names(client, tokens, OFFICER)
    assert "Nashik test survey" not in officer and len(officer) == 2
    operator = _names(client, tokens, OPERATOR)
    assert "Nashik test survey" not in operator and len(operator) == 2  # demo surveys created by operator
    assert _names(client, tokens, VERIFIER) == []


def test_list_is_newest_first_and_filterable(client, tokens, nashik_survey):
    h = auth_header(tokens, ADMIN)
    items = client.get("/api/surveys", headers=h).json()["items"]
    demo = [s for s in items if s["is_demo"]]
    assert demo[0]["survey_date"] > demo[1]["survey_date"]
    assert demo[0]["district_name"] == "Pune" and demo[0]["village_name"] == "Malegaon Bk (demo)"
    assert demo[0]["plot_count"] == 12
    district_id = demo[0]["district_id"]
    filtered = client.get(f"/api/surveys?district_id={district_id}", headers=h).json()["items"]
    assert {s["district_id"] for s in filtered} == {district_id}
    assert client.get("/api/surveys?status=draft", headers=h).json()["total"] == 0


def test_get_survey_with_aoi(client, tokens):
    h = auth_header(tokens, OFFICER)
    sid = client.get("/api/surveys", headers=h).json()["items"][0]["id"]
    body = client.get(f"/api/surveys/{sid}", headers=h).json()
    assert body["aoi"]["type"] == "Polygon"
    assert body["aoi_area_ha"] > 20


def test_survey_not_visible_is_404(client, tokens, nashik_survey):
    assert client.get(f"/api/surveys/{nashik_survey}", headers=auth_header(tokens, OFFICER)).status_code == 404
    assert client.get(f"/api/surveys/{uuid.uuid4()}", headers=auth_header(tokens, ADMIN)).status_code == 404


def test_survey_plots_geojson(client, tokens):
    h = auth_header(tokens, OFFICER)
    sid = client.get("/api/surveys", headers=h).json()["items"][0]["id"]
    fc = client.get(f"/api/surveys/{sid}/plots", headers=h).json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == 12
    props = fc["features"][0]["properties"]
    assert props["plot_code"] == "MLG-001"
    assert props["verification_status"] == "ai_only"
    assert props["is_demo"] is True and props["has_ai_result"] is True
    assert props["health_class"] in {"healthy", "moderate", "severe"}
    assert fc["features"][0]["geometry"]["type"] == "Polygon"


def test_survey_rasters(client, tokens):
    h = auth_header(tokens, OFFICER)
    sid = client.get("/api/surveys", headers=h).json()["items"][0]["id"]
    rasters = client.get(f"/api/surveys/{sid}/rasters", headers=h).json()
    ndvi = next(r for r in rasters if r["kind"] == "ndvi")
    assert ndvi["is_demo"] is True and ndvi["calibrated"] is False
    assert ndvi["tiles_url"].startswith("/api/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=")
    assert "colormap_name=greens" in ndvi["tiles_url"]
    assert ndvi["rescale"] == [0.0, 1.0]
    assert -1 <= ndvi["stats"]["mean"] <= 1


def test_survey_stats(client, tokens):
    h = auth_header(tokens, ADMIN)
    sid = client.get("/api/surveys", headers=h).json()["items"][-1]["id"]
    stats = client.get(f"/api/surveys/{sid}/stats", headers=h).json()
    assert stats["survey_id"] == sid
    assert "cards" in stats and "crop_distribution" in stats


def test_surveys_require_auth(client):
    assert client.get("/api/surveys").status_code == 401
