"""Small geometry helpers shared by API modules and the seed script.

All stored geometries are lon/lat WGS84 (EPSG:4326). Areas and distances are
computed on the WGS84 ellipsoid, never in degrees.
"""
from __future__ import annotations

from typing import Any

from geoalchemy2.elements import WKBElement, WKTElement
from geoalchemy2.shape import from_shape, to_shape
from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry

SRID = 4326
_GEOD = Geod(ellps="WGS84")


def to_geojson(geom: WKBElement | WKTElement | None) -> dict[str, Any] | None:
    if geom is None:
        return None
    return mapping(to_shape(geom))


def from_geojson(data: dict[str, Any]) -> WKBElement:
    return from_shape(shape(data), srid=SRID)


def to_shapely(geom: WKBElement | WKTElement) -> BaseGeometry:
    return to_shape(geom)


def bbox(geom: WKBElement | WKTElement | None) -> list[float] | None:
    """[min_lon, min_lat, max_lon, max_lat] or None."""
    if geom is None:
        return None
    return list(to_shape(geom).bounds)


def geodesic_area_ha(geom: BaseGeometry) -> float:
    """Area of a lon/lat geometry on the WGS84 ellipsoid, in hectares."""
    area_m2, _ = _GEOD.geometry_area_perimeter(geom)
    return abs(area_m2) / 10_000.0


def offset_lonlat(lon: float, lat: float, east_m: float, north_m: float) -> tuple[float, float]:
    """Move a lon/lat point by `east_m` metres east then `north_m` metres north."""
    lon2, lat2, _ = _GEOD.fwd(lon, lat, 90.0, east_m)
    lon3, lat3, _ = _GEOD.fwd(lon2, lat2, 0.0, north_m)
    return lon3, lat3
