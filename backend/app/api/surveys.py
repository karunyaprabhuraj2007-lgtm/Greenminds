"""Surveys: listing, detail, plots (GeoJSON), rasters and stats."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.pagination import page_params, paginate
from app.api.schemas import Page, PageParams
from app.core.config import get_settings, load_yaml_config
from app.core.deps import get_current_user
from app.db.models import District, Plot, Raster, Survey, SurveyStatus, SurveyType, Taluka, User, Village
from app.db.session import get_db
from app.services.geo import bbox, to_geojson, to_shapely
from app.services.plot_data import ai_result_dict, latest_ai_results, latest_verifications, verification_status
from app.services.scope import get_visible_survey, scope_surveys
from app.services.stats import aggregate

router = APIRouter(prefix="/api/surveys", tags=["surveys"])


class SurveyOut(BaseModel):
    id: uuid.UUID
    name: str
    type: SurveyType
    status: SurveyStatus
    district_id: uuid.UUID | None
    taluka_id: uuid.UUID | None
    village_id: uuid.UUID | None
    district_name: str | None = None
    taluka_name: str | None = None
    village_name: str | None = None
    aoi_area_ha: float | None
    bbox: list[float] | None
    aoi: dict[str, Any] | None = None
    survey_date: date | None
    season: str | None
    notes: str | None
    is_demo: bool
    created_by: uuid.UUID | None
    created_at: datetime
    plot_count: int = 0


def survey_out(db: Session, s: Survey, with_geom: bool = False, plot_count: int | None = None) -> SurveyOut:
    names = {}
    for key, model in (("district", District), ("taluka", Taluka), ("village", Village)):
        unit_id = getattr(s, f"{key}_id")
        names[f"{key}_name"] = db.scalar(select(model.name).where(model.id == unit_id)) if unit_id else None
    if plot_count is None:
        plot_count = db.scalar(select(func.count()).select_from(Plot).where(Plot.survey_id == s.id)) or 0
    return SurveyOut(
        id=s.id, name=s.name, type=s.type, status=s.status,
        district_id=s.district_id, taluka_id=s.taluka_id, village_id=s.village_id, **names,
        aoi_area_ha=s.aoi_area_ha, bbox=bbox(s.aoi), aoi=to_geojson(s.aoi) if with_geom else None,
        survey_date=s.survey_date, season=s.season, notes=s.notes, is_demo=s.is_demo,
        created_by=s.created_by, created_at=s.created_at, plot_count=plot_count,
    )


def require_survey(db: Session, user: User, survey_id: uuid.UUID) -> Survey:
    survey = get_visible_survey(db, user, survey_id)
    if survey is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Survey not found")
    return survey


@router.get("", response_model=Page[SurveyOut])
def list_surveys(
    district_id: uuid.UUID | None = None,
    taluka_id: uuid.UUID | None = None,
    village_id: uuid.UUID | None = None,
    status_: SurveyStatus | None = Query(None, alias="status"),
    geometry: bool = False,
    params: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page[SurveyOut]:
    stmt = scope_surveys(select(Survey), user).order_by(
        Survey.survey_date.desc().nulls_last(), Survey.created_at.desc()
    )
    for col, value in ((Survey.district_id, district_id), (Survey.taluka_id, taluka_id), (Survey.village_id, village_id)):
        if value is not None:
            stmt = stmt.where(col == value)
    if status_ is not None:
        stmt = stmt.where(Survey.status == status_)
    rows, total = paginate(db, stmt, params)
    items = [survey_out(db, s, geometry) for s in rows]
    return Page(items=items, total=total, page=params.page, page_size=params.page_size)


@router.get("/{survey_id}", response_model=SurveyOut)
def get_survey(survey_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> SurveyOut:
    return survey_out(db, require_survey(db, user, survey_id), with_geom=True)


@router.get("/{survey_id}/plots")
def survey_plots(survey_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Plots as a GeoJSON FeatureCollection with AI result and verification status."""
    survey = require_survey(db, user, survey_id)
    plots = db.scalars(select(Plot).where(Plot.survey_id == survey.id).order_by(Plot.plot_code)).all()
    ids = [p.id for p in plots]
    ai = latest_ai_results(db, ids)
    ver = latest_verifications(db, ids)
    features = []
    for p in plots:
        props: dict[str, Any] = {
            "id": str(p.id),
            "plot_code": p.plot_code,
            "area_ha": p.area_ha,
            "is_candidate": p.is_candidate,
            "is_demo": p.is_demo,
            "verification_status": verification_status(ver.get(p.id)),
            "has_ai_result": p.id in ai,
        }
        ai_props = ai_result_dict(ai.get(p.id)) or {}
        ai_demo = ai_props.pop("is_demo", False)
        props.update(ai_props)
        props["is_demo"] = p.is_demo or ai_demo
        features.append({"type": "Feature", "id": str(p.id), "geometry": to_geojson(p.geom), "properties": props})
    return {"type": "FeatureCollection", "features": features, "survey_id": str(survey.id)}


class RasterOut(BaseModel):
    id: uuid.UUID
    kind: str
    tiles_url: str | None
    bounds: list[float] | None
    gsd_cm: float | None
    stats: dict[str, Any] | None
    legend: str | None
    rescale: list[float] | None
    colormap_name: str | None
    is_demo: bool
    calibrated: bool


def tiles_url_for(r: Raster) -> str | None:
    if not r.cog_url:
        return None
    style = load_yaml_config("map").get("raster_styles", {}).get(r.kind.value, {}) or {}
    query: dict[str, str] = {"url": r.cog_url}
    if style.get("rescale"):
        query["rescale"] = ",".join(str(v) for v in style["rescale"])
    if style.get("colormap_name"):
        query["colormap_name"] = style["colormap_name"]
    base = get_settings().tile_server_url.rstrip("/")
    # {z}/{x}/{y} placeholders are left for the map client.
    return f"{base}/cog/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}.png?{urlencode(query)}"


@router.get("/{survey_id}/rasters", response_model=list[RasterOut])
def survey_rasters(survey_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[RasterOut]:
    survey = require_survey(db, user, survey_id)
    styles = load_yaml_config("map").get("raster_styles", {})
    rows = db.scalars(select(Raster).where(Raster.survey_id == survey.id).order_by(Raster.kind)).all()
    out = []
    for r in rows:
        style = styles.get(r.kind.value) or {}
        out.append(
            RasterOut(
                id=r.id, kind=r.kind.value, tiles_url=tiles_url_for(r),
                bounds=list(to_shapely(r.bounds).bounds) if r.bounds is not None else None,
                gsd_cm=r.gsd_cm, stats=r.stats_json, legend=style.get("legend"),
                rescale=style.get("rescale"), colormap_name=style.get("colormap_name"),
                is_demo=r.is_demo, calibrated=r.calibrated,
            )
        )
    return out


@router.get("/{survey_id}/stats")
def survey_stats(survey_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    survey = require_survey(db, user, survey_id)
    stats = aggregate(db, [survey], current_only=False)
    stats["survey_id"] = str(survey.id)
    return stats
