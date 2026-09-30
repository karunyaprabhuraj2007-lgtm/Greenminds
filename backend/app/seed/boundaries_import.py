"""Import real Maharashtra district / taluka boundaries (geoBoundaries).

Source file: app/seed/boundaries/maharashtra.geojson, built by
tools/boundaries/fetch_geoboundaries.py. Provenance and licences are stored in
the `datasets` table and linked from each unit.

Idempotent. Units are matched by geoBoundaries shape id, then by name, so the
simplified demo units from earlier versions are upgraded in place (their ids,
and every survey / user reference to them, are kept). Demo units with no real
counterpart (the demo villages) are removed after clearing references.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, shape
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.models import Dataset, District, Plot, Survey, Taluka, User, Village

BOUNDARY_DIR = Path(__file__).resolve().parent / "boundaries"


def _multi(geom_json: dict):
    g = shape(geom_json)
    g = g if isinstance(g, MultiPolygon) else MultiPolygon([g])
    return from_shape(g, srid=4326)


def upsert_datasets(db: Session) -> dict[str, Dataset]:
    out = {}
    for src in json.loads((BOUNDARY_DIR / "sources.json").read_text()):
        ds = db.scalar(select(Dataset).where(Dataset.key == src["key"]))
        if ds is None:
            ds = Dataset(key=src["key"])
            db.add(ds)
        ds.name = src["name"]
        ds.provider = src["provider"]
        ds.original_source = src["original_source"]
        ds.licence = src["licence"]
        ds.url = src["url"]
        ds.attribution = src["attribution"]
        ds.version = f"{src['boundary_id']} (built {src['build_date']}, boundary year {src['boundary_year']})"
        ds.details = src
        ds.fetched_at = ds.fetched_at or datetime.now(UTC)
        out[src["key"]] = ds
    db.flush()
    return out


def import_boundaries(db: Session) -> dict[str, int]:
    datasets = upsert_datasets(db)
    d_ds, t_ds = datasets["geoboundaries-ind-adm2"], datasets["geoboundaries-ind-adm3"]
    features = json.loads((BOUNDARY_DIR / "maharashtra.geojson").read_text())["features"]

    by_shape: dict[str, District] = {}
    counts = {"districts": 0, "talukas": 0}
    for f in (f for f in features if f["properties"]["level"] == "district"):
        p = f["properties"]
        d = db.scalar(select(District).where(District.source_id == p["shape_id"])) or db.scalar(
            select(District).where(District.name == p["name"])
        )
        if d is None:
            d = District(name=p["name"])
            db.add(d)
        d.name, d.source_id, d.dataset_id, d.is_demo = p["name"], p["shape_id"], d_ds.id, False
        d.geom = _multi(f["geometry"])
        by_shape[p["shape_id"]] = d
        counts["districts"] += 1
    db.flush()

    for f in (f for f in features if f["properties"]["level"] == "taluka"):
        p = f["properties"]
        district = by_shape[p["parent_shape_id"]]
        t = db.scalar(select(Taluka).where(Taluka.source_id == p["shape_id"])) or db.scalar(
            select(Taluka).where(Taluka.name == p["name"], Taluka.district_id == district.id, Taluka.source_id.is_(None))
        )
        if t is None:
            t = Taluka(name=p["name"], district_id=district.id)
            db.add(t)
        t.name, t.district_id, t.source_id, t.dataset_id, t.is_demo = p["name"], district.id, p["shape_id"], t_ds.id, False
        t.geom = _multi(f["geometry"])
        counts["talukas"] += 1
    db.flush()

    _remove_demo_units(db)
    return counts


def _remove_demo_units(db: Session) -> None:
    demo_villages = select(Village.id).where(Village.is_demo.is_(True))
    db.execute(update(Survey).where(Survey.village_id.in_(demo_villages)).values(village_id=None))
    db.execute(update(Plot).where(Plot.village_id.in_(demo_villages)).values(village_id=None))
    for v in db.scalars(select(Village).where(Village.is_demo.is_(True))).all():
        db.delete(v)
    demo_talukas = select(Taluka.id).where(Taluka.is_demo.is_(True))
    db.execute(update(Survey).where(Survey.taluka_id.in_(demo_talukas)).values(taluka_id=None))
    for t in db.scalars(select(Taluka).where(Taluka.is_demo.is_(True))).all():
        db.delete(t)
    demo_districts = select(District.id).where(District.is_demo.is_(True))
    db.execute(update(Survey).where(Survey.district_id.in_(demo_districts)).values(district_id=None))
    db.execute(update(User).where(User.district_id.in_(demo_districts)).values(district_id=None))
    for d in db.scalars(select(District).where(District.is_demo.is_(True))).all():
        db.delete(d)
    db.flush()
