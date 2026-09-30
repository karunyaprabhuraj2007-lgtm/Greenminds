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


# --------------------------------------------------------------------------
# Plot creation / import / edit. Geometry always comes from the user (drawn
# or imported); it is never generated.
# --------------------------------------------------------------------------
from fastapi import File, Request, UploadFile  # noqa: E402
from geoalchemy2.shape import from_shape  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from app.core.audit import record_audit, snapshot  # noqa: E402
from app.core.deps import require_capability  # noqa: E402
from app.core.permissions import Capability  # noqa: E402
from app.db.models import PlotAIResult, SurveyStatus  # noqa: E402
from app.services.aoi_io import (  # noqa: E402
    CODE_KEYS,
    PARCEL_KEYS,
    AoiError,
    pick,
    polygon_from_geojson,
    read_plot_features,
    validate_aoi,
)
from app.services.geo import SRID, geodesic_area_ha, to_shapely  # noqa: E402
from app.services.scope import get_visible_survey  # noqa: E402

MAX_IMPORT_BYTES = 20 * 1024 * 1024
MAX_IMPORT_FEATURES = 5000
_editor = require_capability(Capability.create_survey)


class PlotIn(BaseModel):
    geometry: dict[str, Any]
    plot_code: str | None = Field(default=None, max_length=64)
    parcel_ref: str | None = Field(default=None, max_length=120)


class PlotPatch(BaseModel):
    geometry: dict[str, Any] | None = None
    plot_code: str | None = Field(default=None, min_length=1, max_length=64)
    parcel_ref: str | None = Field(default=None, max_length=120)


def _editable_survey(db: Session, user: User, survey_id: uuid.UUID) -> Survey:
    survey = get_visible_survey(db, user, survey_id)
    if survey is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Survey not found")
    if survey.status == SurveyStatus.archived:
        raise HTTPException(status.HTTP_409_CONFLICT, "Archived surveys cannot be edited")
    return survey


def _codes(db: Session, survey_id: uuid.UUID) -> set[str]:
    return set(db.scalars(select(Plot.plot_code).where(Plot.survey_id == survey_id)).all())


def _next_code(existing: set[str]) -> str:
    n = len(existing) + 1
    while f"P-{n:03d}" in existing:
        n += 1
    return f"P-{n:03d}"


def _unique(code: str, existing: set[str]) -> str:
    if code not in existing:
        return code
    n = 2
    while f"{code}-{n}" in existing:
        n += 1
    return f"{code}-{n}"


def _plot_summary(p: Plot) -> dict[str, Any]:
    return {"id": str(p.id), "plot_code": p.plot_code, "area_ha": p.area_ha, "parcel_ref": p.parcel_ref, "source": p.source}


def _outside_warning(poly, survey: Survey) -> str | None:
    if survey.aoi is not None and not to_shapely(survey.aoi).buffer(1e-6).contains(poly):
        return "extends outside the survey area"
    return None


survey_plots_router = APIRouter(prefix="/api/surveys", tags=["plots"])


@survey_plots_router.post("/{survey_id}/plots", status_code=status.HTTP_201_CREATED)
def create_plot(survey_id: uuid.UUID, body: PlotIn, request: Request, db: Session = Depends(get_db),
                user: User = Depends(_editor)) -> dict[str, Any]:
    survey = _editable_survey(db, user, survey_id)
    try:
        poly = validate_aoi(polygon_from_geojson(body.geometry))
    except (AoiError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid plot geometry: {exc}") from None
    codes = _codes(db, survey.id)
    code = body.plot_code.strip() if body.plot_code else _next_code(codes)
    if code in codes:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Plot code {code} already exists in this survey")
    plot = Plot(survey_id=survey.id, plot_code=code, geom=from_shape(poly, srid=SRID),
                area_ha=round(geodesic_area_ha(poly), 4), village_id=survey.village_id,
                parcel_ref=body.parcel_ref, source="drawn", created_by=user.id)
    db.add(plot)
    db.flush()
    record_audit(db, user_id=user.id, action="create", entity="plot", entity_id=plot.id, after=snapshot(plot), request=request)
    db.commit()
    warning = _outside_warning(poly, survey)
    return {**_plot_summary(plot), "warnings": [f"Plot {code} {warning}."] if warning else []}


@survey_plots_router.post("/{survey_id}/plots/import")
async def import_plots(survey_id: uuid.UUID, request: Request, file: UploadFile = File(...),
                       db: Session = Depends(get_db), user: User = Depends(_editor)) -> dict[str, Any]:
    survey = _editable_survey(db, user, survey_id)
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File larger than 20 MB")
    filename = file.filename or "upload"
    try:
        features = read_plot_features(filename, content)
    except AoiError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    if not features:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No polygons found in the file")
    if len(features) > MAX_IMPORT_FEATURES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"More than {MAX_IMPORT_FEATURES} polygons")

    codes = _codes(db, survey.id)
    created, skipped, warnings = [], [], []
    for i, (poly, props) in enumerate(features, start=1):
        try:
            poly = validate_aoi(poly)
        except AoiError as exc:
            skipped.append({"index": i, "reason": str(exc)})
            continue
        code = _unique(pick(props, CODE_KEYS) or _next_code(codes), codes)
        codes.add(code)
        plot = Plot(survey_id=survey.id, plot_code=code, geom=from_shape(poly, srid=SRID),
                    area_ha=round(geodesic_area_ha(poly), 4), village_id=survey.village_id,
                    parcel_ref=pick(props, PARCEL_KEYS), source=f"import:{filename}"[:255], created_by=user.id)
        db.add(plot)
        created.append(plot)
        warning = _outside_warning(poly, survey)
        if warning:
            warnings.append(f"Plot {code} {warning}.")
    db.flush()
    record_audit(db, user_id=user.id, action="import", entity="survey", entity_id=survey.id,
                 after={"file": filename, "created": len(created), "skipped": len(skipped)}, request=request)
    db.commit()
    return {"file": filename, "created": [_plot_summary(p) for p in created], "skipped": skipped, "warnings": warnings[:50]}


@router.patch("/{plot_id}")
def update_plot(plot_id: uuid.UUID, body: PlotPatch, request: Request, db: Session = Depends(get_db),
                user: User = Depends(_editor)) -> dict[str, Any]:
    plot, survey = require_plot(db, user, plot_id)
    _editable_survey(db, user, survey.id)
    before = snapshot(plot)
    changes = body.model_dump(exclude_unset=True)
    if "geometry" in changes:
        try:
            poly = validate_aoi(polygon_from_geojson(changes.pop("geometry")))
        except (AoiError, KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid plot geometry: {exc}") from None
        plot.geom = from_shape(poly, srid=SRID)
        plot.area_ha = round(geodesic_area_ha(poly), 4)
    if "plot_code" in changes and changes["plot_code"] != plot.plot_code and changes["plot_code"] in _codes(db, survey.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Plot code already exists in this survey")
    for k, v in changes.items():
        setattr(plot, k, v)
    db.flush()
    record_audit(db, user_id=user.id, action="update", entity="plot", entity_id=plot.id, before=before,
                 after=snapshot(plot), request=request)
    db.commit()
    return _plot_summary(plot)


@router.delete("/{plot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plot(plot_id: uuid.UUID, request: Request, db: Session = Depends(get_db), user: User = Depends(_editor)) -> None:
    plot, survey = require_plot(db, user, plot_id)
    _editable_survey(db, user, survey.id)
    if db.scalar(select(func.count()).select_from(PlotVerification).where(PlotVerification.plot_id == plot.id)) or \
            db.scalar(select(func.count()).select_from(PlotAIResult).where(PlotAIResult.plot_id == plot.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Plot has results or verifications and cannot be deleted")
    record_audit(db, user_id=user.id, action="delete", entity="plot", entity_id=plot.id, before=snapshot(plot), request=request)
    db.delete(plot)
    db.commit()
