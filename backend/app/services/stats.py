"""Aggregate statistics for dashboards and survey summaries - real rows only.

- Surveys, areas, plots and verifications are counted from the database.
- When the same area was surveyed several times, only the latest survey's
  plots count (older surveys are kept for history, not double-counted).
- Crop health uses each plot's latest *clear* Sentinel-2 NDVI observation and
  the indicative thresholds in config/thresholds.yaml; the basis (source and
  date) is returned with the numbers. Nothing is shown when no data exists.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Plot, PlotVerification, SatelliteObservation, Survey, SurveyStatus
from app.services.plot_data import (
    DONE_STATUSES,
    current_surveys,
    latest_ai_results,
    latest_verifications,
    plots_of,
    union_area_ha,
)
from app.services.satellite.pipeline import SOURCE as SAT_SOURCE
from app.services.satellite.pipeline import satellite_config
from app.services.thresholds import classify_health, load_thresholds

ACTIVE_STATUSES = (
    SurveyStatus.draft, SurveyStatus.planned, SurveyStatus.flying, SurveyStatus.uploaded, SurveyStatus.processing,
)


def _pct(part: float, whole: float) -> float | None:
    return round(100.0 * part / whole, 1) if whole > 0 else None


def _month_keys(n: int = 12) -> list[str]:
    today = datetime.now(UTC).date().replace(day=1)
    keys = []
    y, m = today.year, today.month
    for _ in range(n):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(keys))


def latest_clear_plot_ndvi(db: Session, plot_ids: list, min_clear: float) -> dict[Any, SatelliteObservation]:
    if not plot_ids:
        return {}
    rows = db.scalars(
        select(SatelliteObservation)
        .where(SatelliteObservation.plot_id.in_(plot_ids), SatelliteObservation.ndvi_mean.is_not(None),
               SatelliteObservation.clear_fraction >= min_clear)
        .order_by(SatelliteObservation.plot_id, SatelliteObservation.scene_date.desc())
        .distinct(SatelliteObservation.plot_id)
    ).all()
    return {r.plot_id: r for r in rows}


def aggregate(db: Session, surveys: list[Survey]) -> dict[str, Any]:
    survey_ids = [s.id for s in surveys]
    basis = current_surveys([s for s in surveys if s.id in _surveys_with_plots(db, survey_ids)], statuses=None)
    plots = plots_of(db, [s.id for s in basis])
    ids = [p.id for p in plots]
    plots_ha = sum(p.area_ha or 0.0 for p in plots)
    ver = latest_verifications(db, ids)
    ai = latest_ai_results(db, ids)
    verified_ok = [p for p in plots if p.id in ver and ver[p.id].decision and ver[p.id].decision.value == "verified"]

    cfg = satellite_config()
    thresholds = load_thresholds()
    sat = latest_clear_plot_ndvi(db, ids, cfg["min_clear_fraction"])
    health_ha: dict[str, float] = defaultdict(float)
    health_n: dict[str, int] = defaultdict(int)
    for p in plots:
        obs = sat.get(p.id)
        if obs is None:
            continue
        cls = classify_health(obs.ndvi_mean, thresholds).value
        health_ha[cls] += p.area_ha or 0.0
        health_n[cls] += 1
    assessed_ha = sum(health_ha.values())

    crop_ha: dict[str, float] = defaultdict(float)
    crop_n: dict[str, int] = defaultdict(int)
    for p in plots:
        if p.id in ai and ai[p.id].crop_pred:
            crop_ha[ai[p.id].crop_pred] += p.area_ha or 0.0
            crop_n[ai[p.id].crop_pred] += 1
    crop_total = sum(crop_ha.values())

    last_scene = db.scalar(
        select(func.max(SatelliteObservation.scene_date)).where(
            SatelliteObservation.survey_id.in_(survey_ids), SatelliteObservation.plot_id.is_(None),
            SatelliteObservation.ndvi_mean.is_not(None),
            SatelliteObservation.clear_fraction >= cfg["min_clear_fraction"])
    ) if survey_ids else None
    monitored = db.scalar(
        select(func.count(func.distinct(SatelliteObservation.survey_id))).where(SatelliteObservation.survey_id.in_(survey_ids))
    ) if survey_ids else 0
    n_verifications = db.scalar(
        select(func.count()).select_from(PlotVerification).where(PlotVerification.survey_id.in_(survey_ids))
    ) if survey_ids else 0

    return {
        "cards": {
            "surveys_total": len(surveys),
            "active_surveys": sum(1 for s in surveys if s.status in ACTIVE_STATUSES),
            "completed_surveys": sum(1 for s in surveys if s.status in DONE_STATUSES),
            "total_surveyed_area_ha": round(union_area_ha(db, [s.id for s in surveys if s.aoi is not None]), 2),
            "plots_mapped": len(plots),
            "plots_area_ha": round(plots_ha, 2),
            "field_verifications": int(n_verifications or 0),
            "pending_verifications": len(plots) - sum(1 for p in plots if p.id in ver),
            "satellite_monitored_surveys": int(monitored or 0),
            "last_clear_satellite_date": last_scene.isoformat() if last_scene else None,
            "health_assessed_plots": sum(health_n.values()),
            "healthy_pct": _pct(health_ha["healthy"], assessed_ha),
            "stress_pct": _pct(health_ha["moderate"] + health_ha["severe"], assessed_ha),
        },
        "health": [
            {"health_class": c, "area_ha": round(health_ha[c], 2), "plots": health_n[c], "pct": _pct(health_ha[c], assessed_ha)}
            for c in ("healthy", "moderate", "severe")
        ] if assessed_ha else [],
        "health_basis": {
            "source": SAT_SOURCE,
            "as_of": max((o.scene_date for o in sat.values()), default=None),
            "description": "Latest cloud-free Sentinel-2 NDVI per plot; indicative thresholds "
                           f"(healthy > {thresholds['health']['ndvi_healthy_min']}, severe < {thresholds['health']['ndvi_moderate_min']}).",
        },
        "crop_distribution": sorted(
            ({"crop": c, "area_ha": round(a, 2), "plots": crop_n[c], "pct": _pct(a, crop_total)} for c, a in crop_ha.items()),
            key=lambda r: -r["area_ha"],
        ),
        "verification_funnel": [
            {"stage": "plots_mapped", "label": "Plots mapped", "plots": len(plots)},
            {"stage": "field_verified", "label": "Field verified", "plots": sum(1 for p in plots if p.id in ver)},
            {"stage": "confirmed", "label": "Confirmed by verifier", "plots": len(verified_ok)},
        ],
        "trends": trends(db, survey_ids),
        "basis": {
            "survey_ids": [str(s.id) for s in basis],
            "description": "Plots of the latest survey of each area; older surveys are kept for history.",
        },
        "contains_demo": any(s.is_demo for s in surveys),
    }


def _surveys_with_plots(db: Session, survey_ids: list) -> set:
    if not survey_ids:
        return set()
    return set(db.scalars(select(Plot.survey_id).where(Plot.survey_id.in_(survey_ids)).distinct()).all())


def trends(db: Session, survey_ids: list) -> dict[str, list[dict[str, Any]]]:
    months = _month_keys()
    created = defaultdict(int)
    ndvi: dict[str, list[float]] = defaultdict(list)
    if survey_ids:
        for (ts,) in db.execute(select(Survey.created_at).where(Survey.id.in_(survey_ids))).all():
            created[f"{ts:%Y-%m}"] += 1
        cfg = satellite_config()
        for d, v in db.execute(
            select(SatelliteObservation.scene_date, SatelliteObservation.ndvi_mean).where(
                SatelliteObservation.survey_id.in_(survey_ids), SatelliteObservation.plot_id.is_(None),
                SatelliteObservation.ndvi_mean.is_not(None), SatelliteObservation.clear_fraction >= cfg["min_clear_fraction"])
        ).all():
            ndvi[f"{d:%Y-%m}"].append(v)
    return {
        "surveys_per_month": [{"month": m, "value": created[m]} for m in months],
        "ndvi_monthly_mean": [
            {"month": m, "value": round(sum(ndvi[m]) / len(ndvi[m]), 3) if ndvi[m] else None} for m in months
        ],
    }


def is_empty(summary: dict[str, Any]) -> bool:
    """True when there is nothing to show (drives the dashboard empty state)."""
    return summary["cards"]["surveys_total"] == 0


__all__ = ["aggregate", "is_empty", "trends", "date"]
