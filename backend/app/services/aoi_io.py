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


# --------------------------------------------------------------------------
# Multi-feature readers for plot import (GeoJSON, KML, zipped shapefile)
# --------------------------------------------------------------------------

PlotFeature = tuple[Polygon, dict[str, Any]]


def _explode(geom: BaseGeometry) -> list[Polygon]:
    if isinstance(geom, Polygon):
        return [_drop_z(geom)]
    if isinstance(geom, MultiPolygon):
        return [_drop_z(g) for g in geom.geoms]
    return []


def features_from_geojson(data: dict[str, Any]) -> list[PlotFeature]:
    kind = data.get("type")
    if kind == "FeatureCollection":
        feats = data.get("features", [])
    elif kind == "Feature":
        feats = [data]
    elif kind in ("Polygon", "MultiPolygon"):
        feats = [{"type": "Feature", "geometry": data, "properties": {}}]
    else:
        raise AoiError(f"Unsupported GeoJSON type: {kind!r}")
    out: list[PlotFeature] = []
    for f in feats:
        if not f.get("geometry"):
            continue
        for poly in _explode(shape(f["geometry"])):
            out.append((poly, dict(f.get("properties") or {})))
    return out


def features_from_kml(text: str) -> list[PlotFeature]:
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise AoiError(f"Invalid KML: {exc}") from None
    out: list[PlotFeature] = []
    for pm in root.iter():
        if pm.tag.split("}")[-1] != "Placemark":
            continue
        props: dict[str, Any] = {}
        for child in pm:
            tag = child.tag.split("}")[-1]
            if tag == "name" and child.text:
                props["name"] = child.text.strip()
            if tag == "ExtendedData":
                for data in child.iter():
                    if data.tag.split("}")[-1] in ("Data", "SimpleData") and data.get("name"):
                        value = data.text if data.text is not None else next(
                            (v.text for v in data if v.tag.split("}")[-1] == "value"), None)
                        props[data.get("name")] = (value or "").strip()
        for el in pm.iter():
            if el.tag.split("}")[-1] != "Polygon":
                continue
            wrapper = ET.Element("kml")
            wrapper.append(el)
            try:
                out.append((polygon_from_kml(ET.tostring(wrapper, encoding="unicode")), props))
            except AoiError:
                continue
    return out


def features_from_shapefile_zip(content: bytes) -> list[PlotFeature]:
    import io
    import zipfile

    import shapefile  # pyshp
    from pyproj import CRS, Transformer
    from shapely.ops import transform as shp_transform

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise AoiError("Not a valid .zip file") from None
    names = zf.namelist()
    shp = next((n for n in names if n.lower().endswith(".shp")), None)
    if shp is None:
        raise AoiError("The zip contains no .shp file")
    base = shp[:-4]

    def part(ext: str) -> io.BytesIO | None:
        match = next((n for n in names if n.lower() == (base + ext).lower()), None)
        return io.BytesIO(zf.read(match)) if match else None

    dbf, shx, prj = part(".dbf"), part(".shx"), part(".prj")
    if dbf is None:
        raise AoiError("The shapefile has no .dbf attribute file")
    reproject = None
    if prj is not None:
        crs = CRS.from_wkt(prj.read().decode("utf-8", errors="replace"))
        if not crs.is_geographic or crs.to_epsg() not in (4326, None):
            reproject = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform
    reader = shapefile.Reader(shp=io.BytesIO(zf.read(shp)), shx=shx, dbf=dbf)
    fields = [f[0] for f in reader.fields[1:]]
    out: list[PlotFeature] = []
    for sr in reader.iterShapeRecords():
        if sr.shape.shapeType not in (shapefile.POLYGON, shapefile.POLYGONZ, shapefile.POLYGONM):
            continue
        geom = shape(sr.shape.__geo_interface__)
        if reproject is not None:
            geom = shp_transform(reproject, geom)
        props = {k: (v.strip() if isinstance(v, str) else v) for k, v in zip(fields, sr.record, strict=False)}
        for poly in _explode(geom):
            out.append((poly, props))
    return out


def read_plot_features(filename: str, content: bytes) -> list[PlotFeature]:
    """Polygons + attributes from an uploaded GeoJSON, KML or zipped shapefile."""
    name = filename.lower()
    if name.endswith((".geojson", ".json")):
        try:
            data = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AoiError(f"Invalid GeoJSON: {exc}") from None
        return features_from_geojson(data)
    if name.endswith(".kml"):
        return features_from_kml(content.decode("utf-8", errors="replace"))
    if name.endswith(".zip"):
        return features_from_shapefile_zip(content)
    raise AoiError("Unsupported file type: use .geojson, .json, .kml or a zipped shapefile (.zip)")


CODE_KEYS = ("plot_code", "code", "plot", "plot_id", "name", "id")
PARCEL_KEYS = ("parcel_ref", "parcel", "survey_no", "survey_number", "gat_no", "gut_no", "khasra", "cts_no")


def pick(props: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    lower = {str(k).lower(): v for k, v in props.items()}
    for key in keys:
        v = lower.get(key)
        if v not in (None, ""):
            return str(v)[:64]
    return None
