from tests.conftest import ADMIN, OFFICER, VERIFIER, auth_header


def _plot(client, tokens, email=OFFICER, index=0):
    h = auth_header(tokens, email)
    sid = client.get("/api/surveys", headers=h).json()["items"][0]["id"]  # latest survey
    fc = client.get(f"/api/surveys/{sid}/plots", headers=h).json()
    return fc["features"][index]["properties"]


def test_plot_detail_keeps_ai_and_human_separate(client, tokens):
    props = _plot(client, tokens)
    res = client.get(f"/api/plots/{props['id']}", headers=auth_header(tokens, OFFICER))
    assert res.status_code == 200
    body = res.json()
    assert body["plot_code"] == props["plot_code"]
    assert body["ai_result"]["model_version"] == "demo-seed-v0"
    assert body["verification"] == {"status": "ai_only", "count": 0, "latest": None}
    assert body["survey"]["is_demo"] is True and body["is_demo"] is True
    assert body["village_name"] == "Malegaon Bk (demo)"
    assert body["geometry"]["type"] == "Polygon" and len(body["bbox"]) == 4


def test_plot_timeline_has_one_point_per_dated_survey(client, tokens):
    props = _plot(client, tokens, index=5)
    res = client.get(f"/api/plots/{props['id']}/timeline", headers=auth_header(tokens, ADMIN))
    points = res.json()["points"]
    assert [p["survey_date"] for p in points] == ["2026-07-15", "2026-08-20"]
    assert all(p["plot_code"] == props["plot_code"] for p in points)
    # Seeded early-season NDVI is lower (crop growth).
    assert points[0]["ndvi_mean"] < points[1]["ndvi_mean"]
    assert all(p["is_demo"] for p in points)


def test_plot_not_visible_to_verifier_yet(client, tokens):
    props = _plot(client, tokens)
    assert client.get(f"/api/plots/{props['id']}", headers=auth_header(tokens, VERIFIER)).status_code == 404
    assert client.get(f"/api/plots/{props['id']}/timeline", headers=auth_header(tokens, VERIFIER)).status_code == 404
