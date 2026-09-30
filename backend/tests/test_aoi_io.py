"""Known-answer tests for AOI file parsing and the default-AOI endpoint."""
import json

import pytest
from shapely.geometry import Polygon

from app.core.config import get_settings
from app.services.aoi_io import AoiError, find_default_aoi, polygon_from_geojson, polygon_from_kml, read_aoi_file, validate_aoi
from app.services.geo import geodesic_area_ha, offset_lonlat
from tests.conftest import OFFICER, VERIFIER, auth_header

RING = [list(offset_lonlat(74.4521, 18.2194, e, n)) for e, n in [(0, 0), (200, 0), (200, 100), (0, 100), (0, 0)]]
POLY = {"type": "Polygon", "coordinates": [RING]}


def test_geojson_variants_give_same_polygon():
    feature = {"type": "Feature", "properties": {}, "geometry": POLY}
    fc = {"type": "FeatureCollection", "features": [feature]}
    multi = {"type": "MultiPolygon", "coordinates": [[RING]]}
    for g in (POLY, feature, fc, multi):
        assert geodesic_area_ha(polygon_from_geojson(g)) == pytest.approx(2.0, rel=2e-3)


def test_largest_polygon_is_chosen_and_z_dropped():
    small = [[74.0, 18.0, 5], [74.0001, 18.0, 5], [74.0001, 18.0001, 5], [74.0, 18.0, 5]]
    big = [[*p, 7] for p in RING]
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [small]}},
        {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [big]}},
    ]}
    poly = polygon_from_geojson(fc)
    assert not poly.has_z and geodesic_area_ha(poly) == pytest.approx(2.0, rel=2e-3)


def test_kml_polygon_with_hole():
    hole = [list(offset_lonlat(74.4521, 18.2194, e, n)) for e, n in [(50, 25), (100, 25), (100, 75), (50, 75), (50, 25)]]
    fmt = lambda ring: " ".join(f"{x},{y},0" for x, y in ring)  # noqa: E731
    kml = f"""<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>{fmt(RING)}</coordinates></LinearRing></outerBoundaryIs>
      <innerBoundaryIs><LinearRing><coordinates>{fmt(hole)}</coordinates></LinearRing></innerBoundaryIs></Polygon>
    </Placemark></Document></kml>"""
    poly = polygon_from_kml(kml)
    # 2.0 ha minus a 50 m x 50 m hole (0.25 ha)
    assert geodesic_area_ha(poly) == pytest.approx(1.75, rel=3e-3)


def test_validation_errors():
    with pytest.raises(AoiError):
        validate_aoi(Polygon([(0, 0), (1, 1), (1, 0), (0, 1)]))  # bow-tie
    with pytest.raises(AoiError):
        validate_aoi(Polygon([(500000, 2000000), (500100, 2000000), (500100, 2000100)]))  # projected metres
    with pytest.raises(AoiError):
        polygon_from_geojson({"type": "Point", "coordinates": [74, 18]})
    with pytest.raises(AoiError):
        polygon_from_kml("<kml><not-closed>")


def test_find_default_aoi(tmp_path):
    assert find_default_aoi(tmp_path / "missing") is None
    (tmp_path / "notes.txt").write_text("hello")
    (tmp_path / "a_broken.geojson").write_text("{not json")
    (tmp_path / "b_field.geojson").write_text(json.dumps(POLY))
    path, poly = find_default_aoi(tmp_path)
    assert path.name == "b_field.geojson"
    assert read_aoi_file(path).equals(poly)


def test_default_aoi_endpoint(client, tokens, tmp_path, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "inputs_dir", tmp_path)
    h = auth_header(tokens, OFFICER)
    assert client.get("/api/demo/default-aoi", headers=h).status_code == 404
    (tmp_path / "field.geojson").write_text(json.dumps({"type": "Feature", "geometry": POLY, "properties": {}}))
    body = client.get("/api/demo/default-aoi", headers=h).json()
    assert body["source"] == "field.geojson"
    assert body["area_ha"] == pytest.approx(2.0, rel=2e-3)
    assert body["geometry"]["type"] == "Polygon"
    assert client.get("/api/demo/default-aoi", headers=auth_header(tokens, VERIFIER)).status_code == 403
