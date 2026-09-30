"""Plot detail and per-plot timeline across dated surveys."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import Plot, PlotVerification, Survey, User, Village
from app.db.session import get_db
from app.services.geo import bbox, to_geojson
from app.services.plot_data import ai_result_dict, latest_ai_results, latest_verifications, verification_status
from app.services.scope import scope_surveys

router = APIRouter(prefix="/api/plots", tags=["plots"])


def require_plot(db: Session, user: User, plot_id: uuid.UUID) -> tuple[Plot, Survey]:
    row = db.execute(
        scope_surveys(select(Plot, Survey).join(Survey, Survey.id == Plot.survey_id), user).where(Plot.id == plot_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plot not found")
    return row[0], row[1]


@router.get("/{plot_id}")
def get_plot(plot_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    plot, survey = require_plot(db, user, plot_id)
    ai = latest_ai_results(db, [plot.id]).get(plot.id)
    ver = latest_verifications(db, [plot.id]).get(plot.id)
    n_ver = db.scalar(select(func.count()).select_from(PlotVerification).where(PlotVerification.plot_id == plot.id))
    village = db.scalar(select(Village.name).where(Village.id == plot.village_id)) if plot.village_id else None
    return {
        "id": str(plot.id),
        "plot_code": plot.plot_code,
        "area_ha": plot.area_ha,
        "parcel_ref": plot.parcel_ref,
        "is_candidate": plot.is_candidate,
        "is_demo": plot.is_demo or bool(ai and ai.is_demo),
        "village_name": village,
        "geometry": to_geojson(plot.geom),
        "bbox": bbox(plot.geom),
        "survey": {
            "id": str(survey.id),
            "name": survey.name,
            "survey_date": survey.survey_date.isoformat() if survey.survey_date else None,
            "status": survey.status.value,
            "is_demo": survey.is_demo,
        },
        # AI and human results are reported side by side, never merged.
        "ai_result": ai_result_dict(ai),
        "verification": {
            "status": verification_status(ver),
            "count": n_ver or 0,
            "latest": None
            if ver is None
            else {
                "actual_crop": ver.actual_crop,
                "crop_stage": ver.crop_stage,
                "health_class": ver.health_class.value if ver.health_class else None,
                "damage_pct": ver.damage_pct,
                "decision": ver.decision.value if ver.decision else None,
                "verified_at": ver.verified_at.isoformat() if ver.verified_at else None,
                "photo_count": len(ver.photo_keys or []),
            },
        },
    }


@router.get("/{plot_id}/timeline")
def plot_timeline(plot_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    """One point per dated survey covering this plot's location (oldest first)."""
    plot, _ = require_plot(db, user, plot_id)
    anchor = select(func.ST_PointOnSurface(Plot.geom)).where(Plot.id == plot.id).scalar_subquery()
    rows = db.execute(
        scope_surveys(select(Plot, Survey).join(Survey, Survey.id == Plot.survey_id), user)
        .where(func.ST_Contains(Plot.geom, anchor))
        .order_by(Survey.survey_date.asc().nulls_last(), Survey.created_at)
    ).all()
    ai = latest_ai_results(db, [p.id for p, _ in rows])
    points = []
    for p, s in rows:
        r = ai.get(p.id)
        points.append(
            {
                "survey_id": str(s.id),
                "survey_name": s.name,
                "survey_date": s.survey_date.isoformat() if s.survey_date else None,
                "plot_id": str(p.id),
                "plot_code": p.plot_code,
                "ndvi_mean": r.ndvi_mean if r else None,
                "health_class": r.health_class.value if r and r.health_class else None,
                "crop_pred": r.crop_pred if r else None,
                "is_demo": s.is_demo or bool(r and r.is_demo),
            }
        )
    return {"plot_id": str(plot.id), "points": points}
