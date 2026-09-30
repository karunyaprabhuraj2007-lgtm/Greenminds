"""Queries shared by map, dashboard and plot endpoints."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Plot, PlotAIResult, PlotVerification, Survey, SurveyStatus

DONE_STATUSES = (SurveyStatus.processed, SurveyStatus.verified)


def latest_ai_results(db: Session, plot_ids: list[uuid.UUID]) -> dict[uuid.UUID, PlotAIResult]:
    """Most recent AI result per plot."""
    if not plot_ids:
        return {}
    rows = db.scalars(
        select(PlotAIResult)
        .where(PlotAIResult.plot_id.in_(plot_ids))
        .order_by(PlotAIResult.plot_id, PlotAIResult.created_at.desc())
        .distinct(PlotAIResult.plot_id)
    ).all()
    return {r.plot_id: r for r in rows}


def latest_verifications(db: Session, plot_ids: list[uuid.UUID]) -> dict[uuid.UUID, PlotVerification]:
    """Most recent field verification per plot (never merged into AI results)."""
    if not plot_ids:
        return {}
    rows = db.scalars(
        select(PlotVerification)
        .where(PlotVerification.plot_id.in_(plot_ids))
        .order_by(PlotVerification.plot_id, PlotVerification.verified_at.desc().nulls_last())
        .distinct(PlotVerification.plot_id)
    ).all()
    return {r.plot_id: r for r in rows}


def verification_status(v: PlotVerification | None) -> str:
    """'ai_only' when no human verification exists, else the verifier's recommendation."""
    if v is None:
        return "ai_only"
    return v.decision.value if v.decision else "submitted"


def ai_result_dict(r: PlotAIResult | None) -> dict[str, Any] | None:
    if r is None:
        return None
    return {
        "crop_pred": r.crop_pred,
        "crop_confidence": r.crop_confidence,
        "ndvi_mean": r.ndvi_mean,
        "ndvi_p10": r.ndvi_p10,
        "ndvi_p90": r.ndvi_p90,
        "health_class": r.health_class.value if r.health_class else None,
        "stress_pct": r.stress_pct,
        "damage_pct": r.damage_pct,
        "model_version": r.model_version,
        "is_demo": r.is_demo,
    }


def current_surveys(surveys: list[Survey]) -> list[Survey]:
    """Processed surveys not superseded by a later processed survey of an
    overlapping area. Old surveys are kept; they just don't count twice."""
    from app.services.geo import to_shapely

    done = [s for s in surveys if s.status in DONE_STATUSES and s.aoi is not None and s.survey_date]
    shapes = {s.id: to_shapely(s.aoi) for s in done}
    current = []
    for s in done:
        superseded = any(
            o.id != s.id
            and (o.survey_date, str(o.id)) > (s.survey_date, str(s.id))
            and shapes[o.id].intersects(shapes[s.id])
            for o in done
        )
        if not superseded:
            current.append(s)
    return current


def union_area_ha(db: Session, survey_ids: list[uuid.UUID]) -> float:
    """Geodesic area (ha) of the union of the surveys' AOIs (overlaps counted once)."""
    if not survey_ids:
        return 0.0
    area = db.scalar(
        select(func.ST_Area(func.Geography(func.ST_Union(Survey.aoi)))).where(Survey.id.in_(survey_ids))
    )
    return float(area or 0.0) / 10_000.0


def plots_of(db: Session, survey_ids: list[uuid.UUID]) -> list[Plot]:
    if not survey_ids:
        return []
    return list(db.scalars(select(Plot).where(Plot.survey_id.in_(survey_ids)).order_by(Plot.plot_code)).all())
