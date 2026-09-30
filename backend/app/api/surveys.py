"""Surveys: listing, detail, plots (GeoJSON), rasters and stats."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.pagination import page_params, paginate
from app.api.schemas import Page, PageParams
from app.core.config import get_settings, load_yaml_config
from app.core.audit import record_audit, snapshot
from app.core.deps import get_current_user, require_capability
from app.core.permissions import Capability
from app.db.models import District, Plot, Raster, Role, Survey, SurveyStatus, SurveyType, Taluka, User, Village
from app.db.session import get_db
from app.services.aoi_io import AoiError, polygon_from_geojson, validate_aoi
from app.services.geo import SRID, bbox, geodesic_area_ha, to_geojson, to_shapely
from app.services.thresholds import load_thresholds
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
    last_clear_satellite_date: date | None = None


def last_clear_dates(db: Session, survey_ids: list[uuid.UUID]) -> dict[uuid.UUID, date]:
    from app.db.models import SatelliteObservation
    from app.services.satellite.pipeline import satellite_config

    if not survey_ids:
        return {}
    rows = db.execute(
        select(SatelliteObservation.survey_id, func.max(SatelliteObservation.scene_date))
        .where(SatelliteObservation.survey_id.in_(survey_ids), SatelliteObservation.plot_id.is_(None),
               SatelliteObservation.ndvi_mean.is_not(None),
               SatelliteObservation.clear_fraction >= satellite_config()["min_clear_fraction"])
        .group_by(SatelliteObservation.survey_id)
    ).all()
    return dict(rows)


def survey_out(db: Session, s: Survey, with_geom: bool = False, plot_count: int | None = None,
               last_clear: date | None | bool = False) -> SurveyOut:
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
        last_clear_satellite_date=last_clear_dates(db, [s.id]).get(s.id) if last_clear is False else last_clear,
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
    clear = last_clear_dates(db, [s.id for s in rows])
    items = [survey_out(db, s, geometry, last_clear=clear.get(s.id)) for s in rows]
    return Page(items=items, total=total, page=params.page, page_size=params.page_size)


class SurveyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: SurveyType = SurveyType.crop_survey
    district_id: uuid.UUID
    taluka_id: uuid.UUID | None = None
    village_id: uuid.UUID | None = None
    aoi: dict[str, Any]
    survey_date: date | None = None
    season: str | None = Field(default=None, max_length=40)
    notes: str | None = None


class SurveyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    type: SurveyType | None = None
    taluka_id: uuid.UUID | None = None
    village_id: uuid.UUID | None = None
    aoi: dict[str, Any] | None = None
    survey_date: date | None = None
    season: str | None = Field(default=None, max_length=40)
    notes: str | None = None
    status: SurveyStatus | None = Field(default=None, description="Only 'archived' can be set directly")


class SurveyWriteOut(SurveyOut):
    warnings: list[str] = []


# Once a survey has flown, its AOI is part of the dated record and is frozen.
AOI_EDITABLE = (SurveyStatus.draft, SurveyStatus.planned)


def _parse_aoi(data: dict[str, Any]):
    try:
        poly = validate_aoi(polygon_from_geojson(data))
    except (AoiError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid AOI: {exc}") from None
    area = geodesic_area_ha(poly)
    max_ha = load_thresholds().get("survey", {}).get("max_aoi_area_ha", 2000)
    if area > max_ha:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"AOI is {area:.0f} ha; the maximum per survey is {max_ha} ha. Split it into several surveys.",
        )
    return poly, area


def _check_units(db: Session, user: User, district_id, taluka_id, village_id) -> tuple[District, Taluka | None, Village | None]:
    district = db.get(District, district_id)
    if district is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown district_id")
    if user.role != Role.state_admin and user.district_id and district.id != user.district_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only create surveys in your own district")
    taluka = db.get(Taluka, taluka_id) if taluka_id else None
    if taluka_id and (taluka is None or taluka.district_id != district.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "taluka_id does not belong to the district")
    village = db.get(Village, village_id) if village_id else None
    if village_id and (village is None or taluka is None or village.taluka_id != taluka.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "village_id does not belong to the taluka")
    return district, taluka, village


def _containment_warnings(poly, district, taluka, village) -> list[str]:
    for unit, label in ((village, "village"), (taluka, "taluka"), (district, "district")):
        if unit is not None and unit.geom is not None:
            if not to_shapely(unit.geom).contains(poly):
                note = " (demo boundaries are simplified)" if unit.is_demo else ""
                return [f"AOI is not fully inside the selected {label} boundary{note}."]
            return []
    return []


@router.post("", response_model=SurveyWriteOut, status_code=status.HTTP_201_CREATED)
def create_survey(
    body: SurveyCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability(Capability.create_survey)),
) -> SurveyWriteOut:
    from geoalchemy2.shape import from_shape

    poly, area = _parse_aoi(body.aoi)
    district, taluka, village = _check_units(db, user, body.district_id, body.taluka_id, body.village_id)
    survey = Survey(
        name=body.name, type=body.type, district_id=district.id,
        taluka_id=taluka.id if taluka else None, village_id=village.id if village else None,
        aoi=from_shape(poly, srid=SRID), aoi_area_ha=round(area, 3), status=SurveyStatus.draft,
        created_by=user.id, survey_date=body.survey_date, season=body.season, notes=body.notes,
        is_demo=False,
    )
    db.add(survey)
    db.flush()
    record_audit(db, user_id=user.id, action="create", entity="survey", entity_id=survey.id,
                 after=snapshot(survey), request=request)
    db.commit()
    out = survey_out(db, survey, with_geom=True, plot_count=0).model_dump()
    return SurveyWriteOut(**out, warnings=_containment_warnings(poly, district, taluka, village))


@router.patch("/{survey_id}", response_model=SurveyWriteOut)
def update_survey(
    survey_id: uuid.UUID,
    body: SurveyUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability(Capability.create_survey)),
) -> SurveyWriteOut:
    from geoalchemy2.shape import from_shape

    survey = require_survey(db, user, survey_id)
    changes = body.model_dump(exclude_unset=True)
    if "status" in changes and changes["status"] not in (SurveyStatus.archived, survey.status):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only 'archived' can be set directly; other statuses follow the workflow")
    if "aoi" in changes and survey.status not in AOI_EDITABLE:
        raise HTTPException(status.HTTP_409_CONFLICT, "The AOI of a survey that has flown cannot be changed; create a new survey")
    before = snapshot(survey)
    warnings: list[str] = []
    if "taluka_id" in changes or "village_id" in changes:
        _check_units(db, user, survey.district_id, changes.get("taluka_id", survey.taluka_id),
                     changes.get("village_id", survey.village_id))
    if "aoi" in changes:
        poly, area = _parse_aoi(changes.pop("aoi"))
        survey.aoi = from_shape(poly, srid=SRID)
        survey.aoi_area_ha = round(area, 3)
        d, t, v = _check_units(db, user, survey.district_id, changes.get("taluka_id", survey.taluka_id),
                               changes.get("village_id", survey.village_id))
        warnings = _containment_warnings(poly, d, t, v)
    for key, value in changes.items():
        setattr(survey, key, value)
    db.flush()
    record_audit(db, user_id=user.id, action="update", entity="survey", entity_id=survey.id,
                 before=before, after=snapshot(survey), request=request)
    db.commit()
    return SurveyWriteOut(**survey_out(db, survey, with_geom=True).model_dump(), warnings=warnings)


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
    from app.services.satellite.pipeline import satellite_config
    from app.services.stats import latest_clear_plot_ndvi
    from app.services.thresholds import classify_health, load_thresholds

    sat = latest_clear_plot_ndvi(db, ids, satellite_config()["min_clear_fraction"])
    thresholds = load_thresholds()
    features = []
    for p in plots:
        props: dict[str, Any] = {
            "id": str(p.id),
            "plot_code": p.plot_code,
            "area_ha": p.area_ha,
            "parcel_ref": p.parcel_ref,
            "source": p.source,
            "is_candidate": p.is_candidate,
            "is_demo": p.is_demo,
            "verification_status": verification_status(ver.get(p.id)),
            "has_ai_result": p.id in ai,
        }
        ai_props = ai_result_dict(ai.get(p.id)) or {}
        ai_demo = ai_props.pop("is_demo", False)
        props.update(ai_props)
        props["is_demo"] = p.is_demo or ai_demo
        obs = sat.get(p.id)
        props["sat_ndvi"] = obs.ndvi_mean if obs else None
        props["sat_date"] = obs.scene_date.isoformat() if obs else None
        props["sat_health"] = classify_health(obs.ndvi_mean, thresholds).value if obs else None
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
    source: str | None = None
    scene_id: str | None = None
    acquired_at: datetime | None = None
    cloud_cover: float | None = None
    attribution: str | None = None


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
                is_demo=r.is_demo, calibrated=r.calibrated, source=r.source, scene_id=r.scene_id,
                acquired_at=r.acquired_at, cloud_cover=r.cloud_cover, attribution=r.attribution,
            )
        )
    return out


@router.get("/{survey_id}/stats")
def survey_stats(survey_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    survey = require_survey(db, user, survey_id)
    stats = aggregate(db, [survey])
    stats["survey_id"] = str(survey.id)
    return stats
