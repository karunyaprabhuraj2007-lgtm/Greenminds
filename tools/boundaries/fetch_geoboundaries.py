"""Build the Maharashtra district / taluka boundary file from geoBoundaries.

    python tools/boundaries/fetch_geoboundaries.py [--cache DIR]

Downloads the geoBoundaries gbOpen IND ADM1/ADM2/ADM3 "simplified" releases and
their metadata, keeps the units inside Maharashtra (IN-MH), assigns each
sub-district (taluka) to the district containing its representative point, and
writes backend/app/seed/boundaries/maharashtra.geojson (+ sources.json with
licence and attribution). The backend imports that file at start-up, so the
platform works offline.

geoBoundaries: Runfola et al. (2020) geoBoundaries: A global database of
political administrative boundaries. PLoS ONE 15(4): e0231866.
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

BASE = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/IND"
PAGE = "https://www.geoboundaries.org/countryDownloads.html"
STATE_ISO = "IN-MH"
OUT = Path(__file__).resolve().parents[2] / "backend" / "app" / "seed" / "boundaries"


def fetch(name: str, cache: Path) -> bytes:
    path = cache / name.split("/")[-1]
    if not path.exists():
        with urllib.request.urlopen(f"{BASE}/{name}", timeout=300) as r:
            path.write_bytes(r.read())
    return path.read_bytes()


def rounded(geom, digits: int = 5):
    """GeoJSON geometry with coordinates rounded (1e-5 deg ~ 1 m)."""
    def r(c):
        return [r(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], digits), round(c[1], digits)]
    g = mapping(geom)
    return {"type": g["type"], "coordinates": r(json.loads(json.dumps(g["coordinates"])))}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path("/tmp/geoboundaries-cache"))
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)

    layers, meta = {}, {}
    for level in ("ADM1", "ADM2", "ADM3"):
        layers[level] = json.loads(fetch(f"{level}/geoBoundaries-IND-{level}_simplified.geojson", args.cache))
        meta[level] = json.loads(fetch(f"{level}/geoBoundaries-IND-{level}-metaData.json", args.cache))

    state = next(f for f in layers["ADM1"]["features"] if f["properties"]["shapeISO"] == STATE_ISO)
    state_geom = shape(state["geometry"]).buffer(0)

    def inside(features):
        out = []
        for f in features:
            g = shape(f["geometry"]).buffer(0)
            if state_geom.contains(g.representative_point()):
                out.append((f["properties"], g))
        return out

    districts = inside(layers["ADM2"]["features"])
    talukas = inside(layers["ADM3"]["features"])

    features = [{
        "type": "Feature",
        "properties": {"level": "state", "name": "Maharashtra", "shape_id": state["properties"]["shapeID"]},
        "geometry": rounded(unary_union([g for _, g in districts]).simplify(0.002)),
    }]
    for props, g in sorted(districts, key=lambda d: d[0]["shapeName"]):
        features.append({"type": "Feature", "properties": {
            "level": "district", "name": props["shapeName"], "shape_id": props["shapeID"]}, "geometry": rounded(g)})
    skipped = 0
    for props, g in sorted(talukas, key=lambda d: d[0]["shapeName"]):
        pt = g.representative_point()
        parent = next((dp for dp, dg in districts if dg.contains(pt)), None)
        if parent is None:
            skipped += 1
            continue
        features.append({"type": "Feature", "properties": {
            "level": "taluka", "name": props["shapeName"], "shape_id": props["shapeID"],
            "parent_shape_id": parent["shapeID"]}, "geometry": rounded(g)})

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "maharashtra.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))

    def source(level: str, key: str, name: str) -> dict:
        m = meta[level]
        return {
            "key": key,
            "name": name,
            "provider": "geoBoundaries (gbOpen)",
            "original_source": m["boundarySource"],
            "licence": m["boundaryLicense"],
            "boundary_id": m["boundaryID"],
            "boundary_year": m["boundaryYear"],
            "build_date": m["buildDate"],
            "url": PAGE,
            "attribution": f"Boundaries: geoBoundaries ({m['boundaryID']}, {m['boundarySource']}), {m['boundaryLicense']}",
        }

    sources = [
        source("ADM2", "geoboundaries-ind-adm2", "Maharashtra districts"),
        source("ADM3", "geoboundaries-ind-adm3", "Maharashtra talukas (sub-districts)"),
        source("ADM1", "geoboundaries-ind-adm1", "Maharashtra state outline (dissolved from districts)"),
    ]
    (OUT / "sources.json").write_text(json.dumps(sources, indent=2))
    n_d = sum(1 for f in features if f["properties"]["level"] == "district")
    n_t = sum(1 for f in features if f["properties"]["level"] == "taluka")
    print(f"districts={n_d} talukas={n_t} skipped_talukas={skipped} -> {OUT}")


if __name__ == "__main__":
    main()
