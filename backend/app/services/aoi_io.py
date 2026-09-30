"""Read an area-of-interest polygon from GeoJSON or KML files.

Used for the default demo AOI (the real field polygon in `inputs/`) and, later,
for AOI / plot-boundary uploads. Coordinates are lon/lat WGS84.
"""
from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.geometry.base import BaseGeometry

SUPPORTED_SUFFIXES = (".geojson", ".json", ".kml")


class AoiError(ValueError):
    pass


def _largest_polygon(geoms: list[BaseGeometry]) -> Polygon:
    polys: list[Polygon] = []
    for g in geoms:
        if isinstance(g, Polygon):
            polys.append(g)
        elif isinstance(g, MultiPolygon):
            polys.extend(g.geoms)
    if not polys:
        raise AoiError("No polygon found")
    # Area in degrees is only used to pick the biggest of several polygons.
    return max(polys, key=lambda p: p.area)


def polygon_from_geojson(data: dict[str, Any]) -> Polygon:
    """Largest polygon in a GeoJSON Geometry, Feature or FeatureCollection."""
    kind = data.get("type")
    if kind == "FeatureCollection":
        geoms = [shape(f["geometry"]) for f in data.get("features", []) if f.get("geometry")]
    elif kind == "Feature":
        geoms = [shape(data["geometry"])] if data.get("geometry") else []
    elif kind in ("Polygon", "MultiPolygon"):
        geoms = [shape(data)]
    else:
        raise AoiError(f"Unsupported GeoJSON type: {kind!r}")
    return _drop_z(_largest_polygon(geoms))


def _parse_kml_coords(text: str) -> list[tuple[float, float]]:
    pts = []
    for token in text.split():
        parts = token.split(",")
        if len(parts) >= 2:
            pts.append((float(parts[0]), float(parts[1])))
    return pts


def polygon_from_kml(text: str) -> Polygon:
    """Largest <Polygon> in a KML document (outer boundary + holes)."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise AoiError(f"Invalid KML: {exc}") from None
    polys = []
    for el in root.iter():
        if el.tag.split("}")[-1] != "Polygon":
            continue
        outer, holes = None, []
        for boundary in el:
            name = boundary.tag.split("}")[-1]
            coords = next((c.text for c in boundary.iter() if c.tag.split("}")[-1] == "coordinates"), None)
            if not coords:
                continue
            ring = _parse_kml_coords(coords)
            if name == "outerBoundaryIs":
                outer = ring
            elif name == "innerBoundaryIs":
                holes.append(ring)
        if outer and len(outer) >= 3:
            polys.append(Polygon(outer, holes))
    return _largest_polygon(polys)


def _drop_z(poly: Polygon) -> Polygon:
    if not poly.has_z:
        return poly
    return Polygon([p[:2] for p in poly.exterior.coords], [[p[:2] for p in r.coords] for r in poly.interiors])


def validate_aoi(poly: Polygon) -> Polygon:
    """Check a lon/lat AOI polygon is usable; returns it oriented and closed."""
    if poly.is_empty or not poly.is_valid:
        raise AoiError("AOI polygon is empty or self-intersecting")
    minx, miny, maxx, maxy = poly.bounds
    if not (-180 <= minx <= maxx <= 180 and -90 <= miny <= maxy <= 90):
        raise AoiError("AOI coordinates must be longitude/latitude (EPSG:4326)")
    from shapely.geometry.polygon import orient

    return orient(poly, sign=1.0)


def read_aoi_file(path: Path) -> Polygon:
    suffix = path.suffix.lower()
    text = path.read_text(encoding="utf-8")
    if suffix in (".geojson", ".json"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise AoiError(f"Invalid GeoJSON: {exc}") from None
        return validate_aoi(polygon_from_geojson(data))
    if suffix == ".kml":
        return validate_aoi(polygon_from_kml(text))
    raise AoiError(f"Unsupported file type {suffix}")


def find_default_aoi(folder: Path) -> tuple[Path, Polygon] | None:
    """First readable AOI file in `folder` (sorted by name), or None."""
    if not folder.is_dir():
        return None
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() in SUPPORTED_SUFFIXES and path.is_file():
            try:
                return path, read_aoi_file(path)
            except (AoiError, OSError, KeyError, TypeError, ValueError):
                continue
    return None
