"""Global search: village / taluka / district, survey (name or id), plot code,
crop, date (YYYY-MM-DD) and coordinates ("lat, lon")."""
from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import District, Plot, PlotAIResult, Role, Survey, Taluka, User, Village
from app.db.session import get_db
from app.services.geo import bbox
from app.services.scope import scope_surveys

router = APIRouter(prefix="/api/search", tags=["search"])

_COORD = re.compile(r"^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_coordinates(q: str) -> tuple[float, float] | None:
    """Parse 'lat, lon' (decimal degrees). Returns (lat, lon) or None."""
    m = _COORD.match(q)
    if not m:
        return None
    lat, lon = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon


def _survey_hit(s: Survey, sub: str) -> dict[str, Any]:
    return {"type": "survey", "id": str(s.id), "label": s.name, "sublabel": sub,
            "bbox": bbox(s.aoi), "survey_id": str(s.id), "is_demo": s.is_demo}


@router.get("")
def search(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    q = q.strip()
    results: list[dict[str, Any]] = []

    coords = parse_coordinates(q)
    if coords:
        lat, lon = coords
        results.append({"type": "coordinate", "id": f"{lat},{lon}", "label": f"{lat:.6f}, {lon:.6f}",
                        "sublabel": "Coordinates (lat, lon)", "point": [lon, lat]})
        return {"query": q, "results": results}

    surveys_stmt = scope_surveys(select(Survey), user)
    if _DATE.match(q):
        try:
            day = date.fromisoformat(q)
        except ValueError:
            day = None
        if day:
            for s in db.scalars(surveys_stmt.where(Survey.survey_date == day)).all():
                results.append(_survey_hit(s, f"Survey dated {day.isoformat()}"))
        return {"query": q, "results": results[:limit]}

    try:
        as_uuid = uuid.UUID(q)
    except ValueError:
        as_uuid = None
    if as_uuid:
        s = db.scalar(surveys_stmt.where(Survey.id == as_uuid))
        if s:
            results.append(_survey_hit(s, "Survey id"))
        return {"query": q, "results": results}

    like = f"%{q}%"
    district_scope = user.district_id if user.role == Role.district_officer else None

    def units(model, sublabel):
        stmt = select(model).where(model.name.ilike(like)).order_by(model.name).limit(limit)
        if district_scope is not None:
            if model is District:
                stmt = stmt.where(District.id == district_scope)
            elif model is Taluka:
                stmt = stmt.where(Taluka.district_id == district_scope)
            else:
                stmt = stmt.join(Taluka, Village.taluka_id == Taluka.id).where(Taluka.district_id == district_scope)
        for u in db.scalars(stmt).all():
            results.append({"type": sublabel.lower(), "id": str(u.id), "label": u.name, "sublabel": sublabel,
                            "bbox": bbox(u.geom), "is_demo": u.is_demo})

    if user.role != Role.field_verifier:
        units(District, "District")
        units(Taluka, "Taluka")
        units(Village, "Village")

    for s in db.scalars(surveys_stmt.where(Survey.name.ilike(like)).limit(limit)).all():
        results.append(_survey_hit(s, f"Survey {s.survey_date.isoformat() if s.survey_date else ''}".strip()))

    plot_rows = db.execute(
        scope_surveys(select(Plot, Survey).join(Survey, Survey.id == Plot.survey_id), user)
        .where(Plot.plot_code.ilike(like))
        .order_by(Survey.survey_date.desc().nulls_last(), Plot.plot_code)
        .limit(limit)
    ).all()
    for p, s in plot_rows:
        results.append({"type": "plot", "id": str(p.id), "label": p.plot_code,
                        "sublabel": f"Plot · {s.name}", "bbox": bbox(p.geom), "survey_id": str(s.id),
                        "is_demo": p.is_demo})

    crop_rows = db.execute(
        scope_surveys(
            select(Survey, PlotAIResult.crop_pred)
            .join(PlotAIResult, PlotAIResult.survey_id == Survey.id), user
        )
        .where(PlotAIResult.crop_pred.ilike(like))
        .distinct()
        .limit(limit)
    ).all()
    for s, crop in crop_rows:
        results.append({"type": "crop", "id": f"{s.id}:{crop}", "label": crop.title(),
                        "sublabel": f"Crop in {s.name}", "bbox": bbox(s.aoi), "survey_id": str(s.id),
                        "crop": crop, "is_demo": s.is_demo})

    return {"query": q, "results": results[:limit]}
