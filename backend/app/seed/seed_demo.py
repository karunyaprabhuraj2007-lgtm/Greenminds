"""Idempotent demo seed: users (one per role), admin units, two dated demo
surveys of the same area with plots and demo AI results.

EVERYTHING created here is flagged `is_demo=True` and must be shown with a
"Demo data" badge in the UI. Admin boundaries are simplified rectangles, not
official boundaries. AI results are synthetic, NOT model outputs.

Run: python -m app.seed.seed_demo
"""
from __future__ import annotations

import os
import random
from datetime import date

from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Polygon, box
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.models import (
    District,
    Plot,
    PlotAIResult,
    Role,
    Survey,
    SurveyStatus,
    SurveyType,
    Taluka,
    User,
    Village,
)
from app.db.session import SessionLocal
from app.services.geo import SRID, geodesic_area_ha, offset_lonlat
from app.services.thresholds import classify_health, load_thresholds

DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "GreenMinds@2026")
DEMO_MODEL_VERSION = "demo-seed-v0"  # synthetic values, not a trained model

# Simplified demo boundaries (lon/lat rectangles). NOT official boundaries.
ADMIN_UNITS = [
    {
        "district": ("Pune", (73.30, 17.90, 75.20, 19.40)),
        "talukas": [
            ("Baramati", (74.30, 18.00, 74.90, 18.35), [("Malegaon Bk (demo)", (74.50, 18.11, 74.56, 18.15))]),
            ("Indapur", (74.70, 17.95, 75.15, 18.30), [("Nimgaon Ketki (demo)", (74.86, 18.08, 74.92, 18.12))]),
        ],
    },
    {
        "district": ("Nashik", (73.40, 19.60, 74.90, 20.90)),
        "talukas": [
            ("Niphad", (73.90, 19.95, 74.30, 20.25), [("Pimpalgaon (demo)", (73.97, 20.15, 74.02, 20.19))]),
        ],
    },
]

USERS = [
    ("State Admin (demo)", "admin@greenminds.demo", Role.state_admin, None),
    ("Pune District Officer (demo)", "officer.pune@greenminds.demo", Role.district_officer, "Pune"),
    ("Drone Operator (demo)", "operator@greenminds.demo", Role.drone_operator, "Pune"),
    ("Field Verifier (demo)", "verifier@greenminds.demo", Role.field_verifier, "Pune"),
]

CROPS = ["sugarcane", "soybean", "cotton", "jowar", "onion", "tur"]

# Demo survey area origin (SW corner) inside "Malegaon Bk (demo)".
ORIGIN = (74.520, 18.125)
GRID_COLS, GRID_ROWS = 4, 3
PLOT_W_M, PLOT_H_M, GAP_M = 150.0, 130.0, 6.0

SURVEYS = [
    # (name, date, season, ndvi_shift) — later survey has higher NDVI (crop growth)
    ("Malegaon Bk - Kharif 2026 early season (demo)", date(2026, 7, 15), "Kharif 2026", -0.18),
    ("Malegaon Bk - Kharif 2026 mid season (demo)", date(2026, 8, 20), "Kharif 2026", 0.0),
]


def _mp(bounds: tuple[float, float, float, float]):
    return from_shape(MultiPolygon([box(*bounds)]), srid=SRID)


def _rect(east0: float, north0: float, w: float, h: float) -> Polygon:
    lon0, lat0 = ORIGIN
    corners = [(east0, north0), (east0 + w, north0), (east0 + w, north0 + h), (east0, north0 + h)]
    return Polygon([offset_lonlat(lon0, lat0, e, n) for e, n in corners])


def seed_admin_units(db: Session) -> dict[str, object]:
    index: dict[str, object] = {}
    for entry in ADMIN_UNITS:
        d_name, d_bounds = entry["district"]
        district = db.scalar(select(District).where(District.name == d_name))
        if district is None:
            district = District(name=d_name, geom=_mp(d_bounds), is_demo=True)
            db.add(district)
            db.flush()
        index[d_name] = district
        for t_name, t_bounds, villages in entry["talukas"]:
            taluka = db.scalar(
                select(Taluka).where(Taluka.name == t_name, Taluka.district_id == district.id)
            )
            if taluka is None:
                taluka = Taluka(name=t_name, district_id=district.id, geom=_mp(t_bounds), is_demo=True)
                db.add(taluka)
                db.flush()
            index[t_name] = taluka
            for v_name, v_bounds in villages:
                village = db.scalar(
                    select(Village).where(Village.name == v_name, Village.taluka_id == taluka.id)
                )
                if village is None:
                    village = Village(name=v_name, taluka_id=taluka.id, geom=_mp(v_bounds), is_demo=True)
                    db.add(village)
                    db.flush()
                index[v_name] = village
    return index


def seed_users(db: Session, units: dict[str, object]) -> dict[str, User]:
    users: dict[str, User] = {}
    for name, email, role, district_name in USERS:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                name=name,
                email=email,
                password_hash=hash_password(DEMO_PASSWORD),
                role=role,
                district_id=units[district_name].id if district_name else None,
                active=True,
                is_demo=True,
            )
            db.add(user)
            db.flush()
        users[email] = user
    return users


def _plot_polygons() -> list[tuple[str, Polygon]]:
    plots = []
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            code = f"MLG-{row * GRID_COLS + col + 1:03d}"
            e0 = col * (PLOT_W_M + GAP_M)
            n0 = row * (PLOT_H_M + GAP_M)
            plots.append((code, _rect(e0, n0, PLOT_W_M, PLOT_H_M)))
    return plots


def seed_surveys(db: Session, units: dict[str, object], users: dict[str, User]) -> None:
    thresholds = load_thresholds()
    moderate_min = thresholds["health"]["ndvi_moderate_min"]
    district, taluka, village = units["Pune"], units["Baramati"], units["Malegaon Bk (demo)"]
    creator = users["operator@greenminds.demo"]
    aoi = _rect(-10, -10, GRID_COLS * (PLOT_W_M + GAP_M) + 14, GRID_ROWS * (PLOT_H_M + GAP_M) + 14)
    plot_shapes = _plot_polygons()

    # Per-plot "true" crop and base NDVI, stable across both surveys.
    rng = random.Random(20260820)
    base = {code: (rng.choice(CROPS), rng.uniform(0.22, 0.82)) for code, _ in plot_shapes}

    for name, survey_date, season, shift in SURVEYS:
        if db.scalar(select(Survey.id).where(Survey.name == name, Survey.is_demo.is_(True))):
            continue
        survey = Survey(
            name=name,
            type=SurveyType.crop_survey,
            district_id=district.id,
            taluka_id=taluka.id,
            village_id=village.id,
            aoi=from_shape(aoi, srid=SRID),
            aoi_area_ha=round(geodesic_area_ha(aoi), 3),
            status=SurveyStatus.processed,
            created_by=creator.id,
            survey_date=survey_date,
            season=season,
            notes="Seeded demo survey. Plot values are synthetic, not model outputs.",
            is_demo=True,
        )
        db.add(survey)
        db.flush()
        prng = random.Random(f"{name}")
        for code, poly in plot_shapes:
            crop, ndvi_base = base[code]
            plot = Plot(
                survey_id=survey.id,
                plot_code=code,
                geom=from_shape(poly, srid=SRID),
                area_ha=round(geodesic_area_ha(poly), 3),
                village_id=village.id,
                is_demo=True,
            )
            db.add(plot)
            db.flush()
            ndvi = max(0.05, min(0.9, ndvi_base + shift + prng.uniform(-0.03, 0.03)))
            p10 = max(-0.1, ndvi - prng.uniform(0.08, 0.18))
            p90 = min(0.95, ndvi + prng.uniform(0.05, 0.12))
            # Fraction of the plot below the moderate threshold, approximated
            # linearly from the p10..p90 spread (synthetic).
            stress = 0.0 if p10 >= moderate_min else min(1.0, (moderate_min - p10) / max(p90 - p10, 1e-6))
            db.add(
                PlotAIResult(
                    plot_id=plot.id,
                    survey_id=survey.id,
                    crop_pred=crop,
                    crop_confidence=round(prng.uniform(0.55, 0.9), 2),
                    ndvi_mean=round(ndvi, 3),
                    ndvi_p10=round(p10, 3),
                    ndvi_p90=round(p90, 3),
                    health_class=classify_health(ndvi, thresholds),
                    stress_pct=round(stress * 100, 1),
                    damage_pct=0.0,
                    model_version=DEMO_MODEL_VERSION,
                    is_demo=True,
                )
            )


def seed(db: Session) -> None:
    units = seed_admin_units(db)
    users = seed_users(db, units)
    seed_surveys(db, units, users)
    db.commit()


def main() -> None:
    with SessionLocal() as db:
        seed(db)
    print("Demo seed complete (all records flagged is_demo=True).")


if __name__ == "__main__":
    main()
