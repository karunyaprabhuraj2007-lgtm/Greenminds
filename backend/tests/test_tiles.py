import math

import pytest

from tests.conftest import ADMIN, OFFICER, VERIFIER, auth_header


def _tile_xy(lon, lat, z):
    n = 2**z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


@pytest.fixture()
def ndvi_url(client, tokens):
    h = auth_header(tokens, OFFICER)
    sid = client.get("/api/surveys", headers=h).json()["items"][0]["id"]
    return next(r for r in client.get(f"/api/surveys/{sid}/rasters", headers=h).json() if r["kind"] == "ndvi")["tiles_url"]


def _fill(template, z, x, y):
    return template.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))


def test_tile_inside_bounds_is_png(client, tokens, ndvi_url):
    x, y = _tile_xy(74.522, 18.127, 17)
    res = client.get(_fill(ndvi_url, 17, x, y), headers=auth_header(tokens, OFFICER))
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_tile_outside_bounds_is_204(client, tokens, ndvi_url):
    x, y = _tile_xy(80.0, 25.0, 17)
    assert client.get(_fill(ndvi_url, 17, x, y), headers=auth_header(tokens, OFFICER)).status_code == 204


def test_unregistered_url_rejected(client, tokens):
    res = client.get("/api/tiles/cog/tiles/WebMercatorQuad/1/1/1.png", params={"url": "/etc/passwd"},
                     headers=auth_header(tokens, ADMIN))
    assert res.status_code == 404


def test_scope_and_auth(client, tokens, ndvi_url):
    x, y = _tile_xy(74.522, 18.127, 17)
    assert client.get(_fill(ndvi_url, 17, x, y), headers=auth_header(tokens, VERIFIER)).status_code == 404
    assert client.get(_fill(ndvi_url, 17, x, y)).status_code == 401


def test_bad_parameters(client, tokens, ndvi_url):
    h = auth_header(tokens, ADMIN)
    x, y = _tile_xy(74.522, 18.127, 17)
    url = _fill(ndvi_url, 17, x, y)
    assert client.get(url.replace("WebMercatorQuad", "WGS1984Quad"), headers=h).status_code == 400
    assert client.get(url.replace("colormap_name=greens", "colormap_name=nope"), headers=h).status_code == 400
    assert client.get(url.replace("rescale=0.0%2C1.0", "rescale=abc"), headers=h).status_code == 400


def test_map_config(client, tokens):
    body = client.get("/api/map/config", headers=auth_header(tokens, OFFICER)).json()
    assert body["crops"][0] == "sugarcane"
    assert body["raster_styles"]["ndvi"]["colormap_name"] == "greens"
    assert body["tile_server_url"] == "/api/tiles"
    assert body["health_thresholds"]["ndvi_healthy_min"] == 0.6
    assert client.get("/api/map/config").status_code == 401
