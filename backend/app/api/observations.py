"""Sentinel-2 NDVI time series, Open-Meteo weather and background job status."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.plots import require_plot
from app.api.surveys import require_survey, tiles_url_for
from app.core.audit import record_audit
from app.core.deps import get_current_user, require_capability
from app.core.permissions import Capability
from app.db.models import JobKind, JobStatus, ProcessingJob, Raster, RasterKind, SatelliteObservation, User
from app.db.session import get_db
from app.services.jobs import latest_job, start_job
from app.services.satellite.pipeline import SOURCE, satellite_config
from app.services.weather import weather_config, weather_rows

router = APIRouter(tags=["observations"])


def job_out(job: ProcessingJob | None) -> dict[str, Any] | None:
    if job is None:
        return None
    return {
        "id": str(job.id), "kind": job.kind.value, "status": job.status.value, "progress": job.progress,
        "log": job.log, "result": (job.params_json or {}).get("result"),
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def best_per_date(rows: list[SatelliteObservation]) -> list[dict[str, Any]]:
    """One point per acquisition date: the scene with the most clear pixels."""
    best: dict[Any, SatelliteObservation] = {}
    for r in rows:
        cur = best.get(r.scene_date)
        if cur is None or (r.valid_pixels, r.clear_fraction) > (cur.valid_pixels, cur.clear_fraction):
            best[r.scene_date] = r
    return [
        {
            "date": d.isoformat(), "scene_id": r.scene_id, "platform": r.platform,
            "scene_cloud_pct": r.scene_cloud_pct, "clear_fraction": r.clear_fraction,
            "valid_pixels": r.valid_pixels, "ndvi_mean": r.ndvi_mean, "ndvi_p10": r.ndvi_p10, "ndvi_p90": r.ndvi_p90,
        }
        for d, r in sorted(best.items())
    ]


def _refresh_response(db: Session, survey_id: uuid.UUID, kind: JobKind, min_hours: float, force: bool,
                      request: Request, user: User) -> JSONResponse:
    last = latest_job(db, survey_id, kind)
    if last is not None and last.status in (JobStatus.queued, JobStatus.running):
        return JSONResponse({"cached": False, "running": True, "job": job_out(last)}, status_code=status.HTTP_202_ACCEPTED)
    if (not force and last is not None and last.status == JobStatus.done and last.finished_at
            and datetime.now(UTC) - last.finished_at < timedelta(hours=min_hours)):
        return JSONResponse({"cached": True, "running": False, "job": job_out(last)}, status_code=status.HTTP_200_OK)
    job = start_job(db, survey_id, kind, {"requested_by": str(user.id), "force": force})
    record_audit(db, user_id=user.id, action=f"refresh_{kind.value}", entity="survey", entity_id=survey_id,
                 after={"job_id": str(job.id)}, request=request)
    db.commit()
    code = status.HTTP_202_ACCEPTED if job.status in (JobStatus.queued, JobStatus.running) else status.HTTP_200_OK
    return JSONResponse({"cached": False, "running": job.status in (JobStatus.queued, JobStatus.running), "job": job_out(job)}, status_code=code)


@router.post("/api/surveys/{survey_id}/satellite/refresh")
def refresh_satellite(
    survey_id: uuid.UUID, request: Request, force: bool = False,
    db: Session = Depends(get_db), user: User = Depends(require_capability(Capability.create_survey)),
) -> JSONResponse:
    survey = require_survey(db, user, survey_id)
    return _refresh_response(db, survey.id, JobKind.satellite, satellite_config()["min_refresh_interval_hours"], force, request, user)


@router.get("/api/surveys/{survey_id}/satellite")
def survey_satellite(survey_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    survey = require_survey(db, user, survey_id)
    cfg = satellite_config()
    rows = list(db.scalars(
        select(SatelliteObservation).where(SatelliteObservation.survey_id == survey.id, SatelliteObservation.plot_id.is_(None))
    ).all())
    series = best_per_date(rows)
    clear = [p for p in series if p["ndvi_mean"] is not None and p["clear_fraction"] >= cfg["min_clear_fraction"]]
    layer = db.scalar(select(Raster).where(Raster.survey_id == survey.id, Raster.kind == RasterKind.ndvi, Raster.source == SOURCE))
    return {
        "source": SOURCE, "collection": cfg["collection"], "stac_url": cfg["stac_url"],
        "attribution": cfg["attribution"], "licence": cfg["licence"],
        "min_clear_fraction": cfg["min_clear_fraction"],
        "series": series,
        "scenes_total": len(series),
        "scenes_clear": len(clear),
        "latest_clear": clear[-1] if clear else None,
        "layer": None if layer is None else {
            "id": str(layer.id), "tiles_url": tiles_url_for(layer), "scene_id": layer.scene_id,
            "acquired_at": layer.acquired_at.isoformat() if layer.acquired_at else None,
            "cloud_cover": layer.cloud_cover, "attribution": layer.attribution,
        },
        "job": job_out(latest_job(db, survey.id, JobKind.satellite)),
    }


@router.get("/api/plots/{plot_id}/satellite")
def plot_satellite(plot_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    plot, _ = require_plot(db, user, plot_id)
    cfg = satellite_config()
    rows = list(db.scalars(select(SatelliteObservation).where(SatelliteObservation.plot_id == plot.id)).all())
    series = best_per_date(rows)
    clear = [p for p in series if p["ndvi_mean"] is not None and p["clear_fraction"] >= cfg["min_clear_fraction"]]
    return {"plot_id": str(plot.id), "source": SOURCE, "attribution": cfg["attribution"], "series": series,
            "latest_clear": clear[-1] if clear else None, "min_clear_fraction": cfg["min_clear_fraction"]}


@router.post("/api/surveys/{survey_id}/weather/refresh")
def refresh_weather_endpoint(
    survey_id: uuid.UUID, request: Request, force: bool = False,
    db: Session = Depends(get_db), user: User = Depends(require_capability(Capability.create_survey)),
) -> JSONResponse:
    survey = require_survey(db, user, survey_id)
    return _refresh_response(db, survey.id, JobKind.weather, weather_config()["min_refresh_interval_hours"], force, request, user)


@router.get("/api/surveys/{survey_id}/weather")
def survey_weather(survey_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    survey = require_survey(db, user, survey_id)
    cfg = weather_config()
    since = datetime.now(UTC).date() - timedelta(days=cfg["history_days"])
    rows = weather_rows(db, survey.id, since)
    today = datetime.now(UTC).date()
    past = [r for r in rows if r.day <= today]
    return {
        "source": "Open-Meteo", "attribution": cfg["attribution"], "licence": cfg["licence"],
        "days": [{"day": r.day.isoformat(), "precip_mm": r.precip_mm, "tmax_c": r.tmax_c, "tmin_c": r.tmin_c,
                  "source": r.source} for r in rows],
        "totals": {
            "rain_mm_last_90d": round(sum(r.precip_mm or 0 for r in past), 1) if past else None,
            "rain_mm_last_30d": round(sum(r.precip_mm or 0 for r in past if r.day > today - timedelta(days=30)), 1) if past else None,
        },
        "fetched_at": max((r.fetched_at for r in rows), default=None),
        "job": job_out(latest_job(db, survey.id, JobKind.weather)),
    }


@router.get("/api/surveys/{survey_id}/jobs")
def survey_jobs(survey_id: uuid.UUID, kind: JobKind | None = Query(None), db: Session = Depends(get_db),
                user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    survey = require_survey(db, user, survey_id)
    stmt = select(ProcessingJob).where(ProcessingJob.survey_id == survey.id).order_by(ProcessingJob.created_at.desc()).limit(50)
    if kind is not None:
        stmt = stmt.where(ProcessingJob.kind == kind)
    return [job_out(j) for j in db.scalars(stmt).all()]
