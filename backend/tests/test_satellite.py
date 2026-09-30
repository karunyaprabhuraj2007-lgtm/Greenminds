"""Sentinel-2 STAC / NDVI pipeline (recorded STAC fixture + generated rasters)."""
import json
from datetime import UTC, datetime

import httpx
import numpy as np
import pytest

from app.services.satellite import pipeline
from app.services.satellite.ndvi import ndvi_from_reflectance, stats_for
from app.services.satellite.stac import StacError, parse_item, search_scenes
from tests.conftest import OFFICER, OPERATOR, VERIFIER, auth_header
from tests.satellite_fixture import FIXTURES, stac_transport

KEYS = {"red": "red", "nir": "nir", "scl": "scl"}
NDVI_CLEAR = (0.30 - 0.05) / (0.30 + 0.05)   # 0.7143 with the -0.1 offset applied
NDVI_PLOT = (0.10 - 0.05) / (0.10 + 0.05)    # 0.3333


# ---- pure functions --------------------------------------------------------

def test_ndvi_known_answers():
    red = np.array([0.05, 0.1, 0.0, 0.2])
    nir = np.array([0.30, 0.1, 0.0, 0.1])
    out = ndvi_from_reflectance(red, nir)
    assert out[0] == pytest.approx(NDVI_CLEAR, abs=1e-6)
    assert out[1] == 0.0
    assert np.isnan(out[2])                       # 0/0 undefined
    assert out[3] == pytest.approx(-1 / 3)


def test_stats_for_counts_only_clear_pixels_in_mask():
    ndvi = np.array([[0.2, 0.4, np.nan], [0.6, 0.8, 0.9]])
    mask = np.array([[True, True, True], [True, True, False]])
    st = stats_for(ndvi, mask, min_valid=1)
    assert (st.total_pixels, st.valid_pixels) == (5, 4)
    assert st.clear_fraction == pytest.approx(0.8)
    assert st.mean == pytest.approx(0.5)
    none = stats_for(ndvi, mask, min_valid=10)
    assert none.mean is None and none.valid_pixels == 4


def test_parse_item_reads_scale_and_offset():
    page = json.loads((FIXTURES / "earth_search_s2_page1.json").read_text())
    scene = parse_item(page["features"][0], KEYS)
    assert scene.id == "S2B_43QDA_20260825_0_L2A" and scene.platform == "sentinel-2b"
    assert scene.cloud_cover == 64.2
    assert (scene.assets["red"].scale, scene.assets["red"].offset) == (0.0001, -0.1)
    assert scene.assets["scl"].scale == 1.0 and scene.assets["scl"].offset == 0.0
    assert parse_item({**page["features"][0], "assets": {}}, KEYS) is None


def test_search_follows_pagination_and_sends_filters(tmp_path):
    requests = []
    with httpx.Client(transport=stac_transport(tmp_path, requests)) as client:
        scenes = search_scenes(client, "https://earth-search.aws.element84.com/v1", "sentinel-2-l2a",
                               {"type": "Point", "coordinates": [74.45, 18.22]},
                               datetime(2025, 9, 1, tzinfo=UTC), datetime(2026, 9, 1, tzinfo=UTC), KEYS, max_cloud=80)
    assert [s.date.isoformat() for s in scenes] == ["2026-06-10", "2026-07-20", "2026-08-25"]  # oldest first
    assert len(requests) == 2 and requests[1]["next"] == "page-2-token"
    first = requests[0]
    assert first["collections"] == ["sentinel-2-l2a"]
    assert first["datetime"] == "2025-09-01T00:00:00Z/2026-09-01T00:00:00Z"
    assert first["query"] == {"eo:cloud_cover": {"lte": 80}}
    assert first["intersects"]["type"] == "Point"


def test_search_error_is_reported():
    transport = httpx.MockTransport(lambda r: httpx.Response(503, text="unavailable"))
    with httpx.Client(transport=transport) as client, pytest.raises(StacError, match="503"):
        search_scenes(client, "https://x", "c", {"type": "Point", "coordinates": [0, 0]},
                      datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 2, 1, tzinfo=UTC), KEYS)


# ---- pipeline through the API ---------------------------------------------

def test_refresh_result(satellite_world):
    job = satellite_world["refresh"]["job"]
    assert job["status"] == "done" and job["kind"] == "satellite"
    result = job["result"]
    assert result["scenes_found"] == 3 and result["scenes_processed"] == 3 and result["scenes_failed"] == 0
    assert result["latest_clear_scene"]["scene_id"] == "S2A_43QDA_20260610_0_L2A"


def test_survey_series(client, tokens, world, satellite_world):
    body = client.get(f"/api/surveys/{world['new']['id']}/satellite", headers=auth_header(tokens, OFFICER)).json()
    assert body["source"] == "Sentinel-2 L2A" and "Copernicus" in body["attribution"]
    series = {p["date"]: p for p in body["series"]}
    assert list(series) == ["2026-06-10", "2026-07-20", "2026-08-25"]
    june, july, aug = series["2026-06-10"], series["2026-07-20"], series["2026-08-25"]
    assert june["clear_fraction"] == pytest.approx(1.0)
    assert june["ndvi_p90"] == pytest.approx(NDVI_CLEAR, abs=1e-3)
    # Plot P-001 (90 x 120 m) is 8.6% of the 420 x 300 m AOI: area-weighted mean.
    share = (90 * 120) / (420 * 300)
    assert june["ndvi_mean"] == pytest.approx(share * NDVI_PLOT + (1 - share) * NDVI_CLEAR, abs=5e-3)
    assert 0.35 < july["clear_fraction"] < 0.65                            # west half cloudy
    assert july["ndvi_mean"] == pytest.approx(NDVI_CLEAR, abs=1e-3)      # east half only
    assert aug["clear_fraction"] == 0 and aug["ndvi_mean"] is None        # fully cloudy
    assert body["scenes_clear"] == 1 and body["latest_clear"]["date"] == "2026-06-10"
    assert body["layer"]["scene_id"] == "S2A_43QDA_20260610_0_L2A"
    assert body["layer"]["tiles_url"].startswith("/api/tiles/cog/tiles/WebMercatorQuad/")


def test_plot_series(client, tokens, world, satellite_world):
    p1 = world["new"]["plots"][0]["id"]
    p2 = world["new"]["plots"][1]["id"]
    s1 = client.get(f"/api/plots/{p1}/satellite", headers=auth_header(tokens, OFFICER)).json()
    s2 = client.get(f"/api/plots/{p2}/satellite", headers=auth_header(tokens, OFFICER)).json()
    assert s1["series"][0]["ndvi_mean"] == pytest.approx(NDVI_PLOT, abs=1e-3)
    assert s2["series"][0]["ndvi_mean"] == pytest.approx(NDVI_CLEAR, abs=1e-3)
    assert s1["latest_clear"]["date"] == "2026-06-10"


def test_ndvi_layer_registered_and_tiles(client, tokens, world, satellite_world):
    h = auth_header(tokens, OFFICER)
    rasters = client.get(f"/api/surveys/{world['new']['id']}/rasters", headers=h).json()
    ndvi = next(r for r in rasters if r["kind"] == "ndvi")
    assert ndvi["source"] == "Sentinel-2 L2A" and ndvi["scene_id"] == "S2A_43QDA_20260610_0_L2A"
    assert ndvi["acquired_at"].startswith("2026-06-10") and ndvi["cloud_cover"] == 3.1
    assert ndvi["calibrated"] is True and ndvi["is_demo"] is False
    import math
    lon, lat, z = 74.4535, 18.2206, 16
    n = 2**z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    tile = client.get(ndvi["tiles_url"].replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y)), headers=h)
    assert tile.status_code == 200 and tile.content[:4] == b"\x89PNG"


def test_refresh_is_cached(client, tokens, world, satellite_world):
    res = client.post(f"/api/surveys/{world['new']['id']}/satellite/refresh", headers=auth_header(tokens, OPERATOR))
    assert res.status_code == 200 and res.json()["cached"] is True


def test_forced_refresh_reuses_processed_scenes(client, tokens, world, satellite_world, monkeypatch):
    monkeypatch.setattr(pipeline, "http_client_factory",
                        lambda: httpx.Client(transport=stac_transport(satellite_world["folder"])))
    res = client.post(f"/api/surveys/{world['new']['id']}/satellite/refresh?force=true", headers=auth_header(tokens, OPERATOR))
    assert res.json()["job"]["result"]["scenes_processed"] == 0


def test_no_scenes_is_handled(client, tokens, world, monkeypatch):
    empty = httpx.MockTransport(lambda r: httpx.Response(200, json={"type": "FeatureCollection", "features": [], "links": []}))
    monkeypatch.setattr(pipeline, "http_client_factory", lambda: httpx.Client(transport=empty))
    res = client.post(f"/api/surveys/{world['old']['id']}/satellite/refresh?force=true", headers=auth_header(tokens, OPERATOR))
    assert res.json()["job"]["status"] == "done"
    body = client.get(f"/api/surveys/{world['old']['id']}/satellite", headers=auth_header(tokens, OPERATOR)).json()
    assert body["series"] == [] and body["latest_clear"] is None and body["layer"] is None


def test_stac_failure_marks_job_failed(client, tokens, world, monkeypatch):
    down = httpx.MockTransport(lambda r: httpx.Response(403, text="Forbidden"))
    monkeypatch.setattr(pipeline, "http_client_factory", lambda: httpx.Client(transport=down))
    res = client.post(f"/api/surveys/{world['old']['id']}/satellite/refresh?force=true", headers=auth_header(tokens, OPERATOR))
    job = res.json()["job"]
    assert job["status"] == "failed" and "403" in job["log"]
    jobs = client.get(f"/api/surveys/{world['old']['id']}/jobs?kind=satellite", headers=auth_header(tokens, OPERATOR)).json()
    assert jobs[0]["status"] == "failed"


def test_satellite_permissions(client, tokens, world):
    assert client.post(f"/api/surveys/{world['new']['id']}/satellite/refresh", headers=auth_header(tokens, VERIFIER)).status_code == 403
    assert client.get(f"/api/surveys/{world['nashik']}/satellite", headers=auth_header(tokens, OFFICER)).status_code == 404


def test_plot_geojson_and_survey_carry_latest_clear_ndvi(client, tokens, world, satellite_world):
    h = auth_header(tokens, OFFICER)
    fc = client.get(f"/api/surveys/{world['new']['id']}/plots", headers=h).json()
    p1 = fc["features"][0]["properties"]
    assert p1["sat_date"] == "2026-06-10" and p1["sat_health"] == "moderate"
    assert p1["sat_ndvi"] == pytest.approx(NDVI_PLOT, abs=1e-3)
    s = client.get(f"/api/surveys/{world['new']['id']}", headers=h).json()
    assert s["last_clear_satellite_date"] == "2026-06-10"
    listed = next(x for x in client.get("/api/surveys", headers=h).json()["items"] if x["id"] == world["new"]["id"])
    assert listed["last_clear_satellite_date"] == "2026-06-10"
