from tests.conftest import ADMIN, OFFICER, VERIFIER, auth_header


def _plot(client, tokens, world, key="new", index=0, email=OFFICER):
    fc = client.get(f"/api/surveys/{world[key]['id']}/plots", headers=auth_header(tokens, email)).json()
    return fc["features"][index]["properties"]


def test_plot_detail_keeps_ai_and_human_separate(client, tokens, world):
    props = _plot(client, tokens, world)
    body = client.get(f"/api/plots/{props['id']}", headers=auth_header(tokens, OFFICER)).json()
    assert body["plot_code"] == "P-001" and body["parcel_ref"] == "Gat 101"
    assert body["ai_result"] is None
    assert body["verification"] == {"status": "ai_only", "count": 0, "latest": None}
    assert body["is_demo"] is False and body["survey"]["is_demo"] is False
    assert body["geometry"]["type"] == "Polygon" and len(body["bbox"]) == 4
    assert abs(body["area_ha"] - 1.08) < 0.01  # 90 m x 120 m


def test_plot_timeline_has_one_point_per_dated_survey(client, tokens, world):
    props = _plot(client, tokens, world, index=2)
    points = client.get(f"/api/plots/{props['id']}/timeline", headers=auth_header(tokens, ADMIN)).json()["points"]
    assert [p["survey_date"] for p in points] == ["2026-07-15", "2026-08-20"]
    assert all(p["plot_code"] == "P-003" for p in points)
    assert all(p["ndvi_mean"] is None for p in points)  # no AI results exist


def test_plot_not_visible_to_verifier_yet(client, tokens, world):
    props = _plot(client, tokens, world)
    assert client.get(f"/api/plots/{props['id']}", headers=auth_header(tokens, VERIFIER)).status_code == 404
    assert client.get(f"/api/plots/{props['id']}/timeline", headers=auth_header(tokens, VERIFIER)).status_code == 404
