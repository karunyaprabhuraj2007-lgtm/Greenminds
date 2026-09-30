"""Dashboard summary for the State -> District -> Taluka -> Village hierarchy."""
from __future__ import annotations

import uuid
from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import require_capability
from app.core.permissions import Capability
from app.db.models import District, Role, Survey, Taluka, User, Village
from app.db.session import get_db
from app.services.geo import bbox, to_geojson
from app.services.scope import scope_surveys
from app.services.stats import aggregate

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class Level(str, Enum):
    state = "state"
    district = "district"
    taluka = "taluka"
    village = "village"


# level -> (unit model, survey column, child level, child model, child parent column)
_HIERARCHY = {
    Level.state: (None, None, Level.district, District, None),
    Level.district: (District, Survey.district_id, Level.taluka, Taluka, Taluka.district_id),
    Level.taluka: (Taluka, Survey.taluka_id, Level.village, Village, Village.taluka_id),
    Level.village: (Village, Survey.village_id, None, None, None),
}
_SURVEY_COL = {Level.district: Survey.district_id, Level.taluka: Survey.taluka_id, Level.village: Survey.village_id}


def _unit_district_id(db: Session, level: Level, unit: Any) -> uuid.UUID | None:
    if level == Level.district:
        return unit.id
    if level == Level.taluka:
        return unit.district_id
    if level == Level.village:
        return db.scalar(select(Taluka.district_id).where(Taluka.id == unit.taluka_id))
    return None


def _path(db: Session, level: Level, unit: Any) -> list[dict[str, Any]]:
    """Ancestors from the state down to (and including) the unit, for breadcrumbs."""
    chain: list[tuple[str, Any]] = []
    if level == Level.village:
        taluka = db.get(Taluka, unit.taluka_id)
        chain = [("district", db.get(District, taluka.district_id)), ("taluka", taluka), ("village", unit)]
    elif level == Level.taluka:
        chain = [("district", db.get(District, unit.district_id)), ("taluka", unit)]
    elif level == Level.district:
        chain = [("district", unit)]
    return [{"level": lvl, "id": str(u.id), "name": u.name, "bbox": bbox(u.geom)} for lvl, u in chain]


@router.get("/summary")
def summary(
    level: Level = Level.state,
    id: uuid.UUID | None = Query(None, description="Unit id (required unless level=state)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_capability(Capability.view_dashboard)),
) -> dict[str, Any]:
    model, survey_col, child_level, child_model, child_parent_col = _HIERARCHY[level]
    unit = None
    if level != Level.state:
        if id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "id is required for this level")
        unit = db.get(model, id)
        if unit is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unit not found")
        if user.role == Role.district_officer and _unit_district_id(db, level, unit) != user.district_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Outside your district")

    stmt = scope_surveys(select(Survey), user)
    if survey_col is not None:
        stmt = stmt.where(survey_col == unit.id)
    surveys = list(db.scalars(stmt).all())
    result = aggregate(db, surveys)

    children: list[dict[str, Any]] = []
    if child_model is not None:
        cstmt = select(child_model).order_by(child_model.name)
        if child_parent_col is not None:
            cstmt = cstmt.where(child_parent_col == unit.id)
        if child_model is District and user.role == Role.district_officer:
            cstmt = cstmt.where(District.id == user.district_id)
        child_col = _SURVEY_COL[child_level]
        for child in db.scalars(cstmt).all():
            child_surveys = [s for s in surveys if getattr(s, child_col.key) == child.id]
            agg = aggregate(db, child_surveys) if child_surveys else None
            children.append(
                {
                    "id": str(child.id),
                    "name": child.name,
                    "level": child_level.value,
                    "is_demo": child.is_demo,
                    "surveys": len(child_surveys),
                    "surveyed_area_ha": agg["cards"]["total_surveyed_area_ha"] if agg else 0.0,
                    "fields_analysed": agg["cards"]["fields_analysed"] if agg else 0,
                    "healthy_pct": agg["cards"]["healthy_pct"] if agg else None,
                    "contains_demo": agg["contains_demo"] if agg else False,
                    "bbox": bbox(child.geom),
                    "geometry": to_geojson(child.geom),
                }
            )
    else:
        # Village level: surveys are the children.
        for s in sorted(surveys, key=lambda s: (s.survey_date is None, s.survey_date), reverse=True):
            children.append(
                {"id": str(s.id), "name": s.name, "level": "survey", "is_demo": s.is_demo,
                 "survey_date": s.survey_date.isoformat() if s.survey_date else None,
                 "status": s.status.value, "bbox": bbox(s.aoi)}
            )

    result.update(
        {
            "level": level.value,
            "unit": None
            if unit is None
            else {"id": str(unit.id), "name": unit.name, "is_demo": unit.is_demo, "bbox": bbox(unit.geom),
                  "geometry": to_geojson(unit.geom)},
            "children": children,
            "path": _path(db, level, unit) if unit is not None else [],
        }
    )
    return result
