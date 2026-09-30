"""Known-answer tests for geometry helpers."""
import pytest
from pyproj import Geod
from shapely.geometry import Polygon, box

from app.services.geo import bbox, from_geojson, geodesic_area_ha, offset_lonlat, to_geojson

GEOD = Geod(ellps="WGS84")


def _square(lon, lat, side_m):
    pts = [offset_lonlat(lon, lat, e, n) for e, n in [(0, 0), (side_m, 0), (side_m, side_m), (0, side_m)]]
    return Polygon(pts)


@pytest.mark.parametrize("lat", [0.0, 18.13, 45.0])
def test_offset_lonlat_distance(lat):
    lon2, lat2 = offset_lonlat(74.5, lat, 300.0, 0.0)
    _, _, dist = GEOD.inv(74.5, lat, lon2, lat2)
    assert dist == pytest.approx(300.0, abs=0.01)
    lon3, lat3 = offset_lonlat(74.5, lat, 0.0, 400.0)
    _, _, dist = GEOD.inv(74.5, lat, lon3, lat3)
    assert dist == pytest.approx(400.0, abs=0.01)


@pytest.mark.parametrize("side_m,expected_ha", [(100, 1.0), (1000, 100.0), (150, 2.25)])
def test_geodesic_area_of_metric_square(side_m, expected_ha):
    # Square built from metre offsets at Baramati latitude.
    assert geodesic_area_ha(_square(74.52, 18.125, side_m)) == pytest.approx(expected_ha, rel=1e-3)


def test_geodesic_area_one_degree_cell_at_equator():
    # 1x1 degree cell at the equator on WGS84 is ~12,308 km^2.
    assert geodesic_area_ha(box(0, 0, 1, 1)) / 100 == pytest.approx(12308.8, rel=1e-3)


def test_area_is_orientation_independent():
    poly = _square(74.52, 18.125, 200)
    assert geodesic_area_ha(poly) == pytest.approx(geodesic_area_ha(poly.reverse()), rel=1e-9)


def test_geojson_roundtrip_and_bbox():
    gj = {"type": "Polygon", "coordinates": [[[74.0, 18.0], [74.1, 18.0], [74.1, 18.1], [74.0, 18.1], [74.0, 18.0]]]}
    elem = from_geojson(gj)
    assert elem.srid == 4326
    assert to_geojson(elem)["type"] == "Polygon"
    assert bbox(elem) == pytest.approx([74.0, 18.0, 74.1, 18.1])
    assert to_geojson(None) is None and bbox(None) is None
