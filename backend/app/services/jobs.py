"""Background jobs recorded in `processing_jobs` and executed by the RQ worker
(or inline when JOBS_INLINE=true, e.g. in tests or without Redis)."""
from __future__ import annotations

import logging
import traceback
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import JobKind, JobStatus, ProcessingJob, Survey
from app.db.session import SessionLocal

log = logging.getLogger(__name__)


def latest_job(db: Session, survey_id: uuid.UUID, kind: JobKind) -> ProcessingJob | None:
    return db.scalar(
        select(ProcessingJob).where(ProcessingJob.survey_id == survey_id, ProcessingJob.kind == kind)
        .order_by(ProcessingJob.created_at.desc())
    )


def start_job(db: Session, survey_id: uuid.UUID, kind: JobKind, params: dict[str, Any] | None = None) -> ProcessingJob:
    job = ProcessingJob(survey_id=survey_id, kind=kind, status=JobStatus.queued, progress=0.0, params_json=params or {})
    db.add(job)
    db.commit()
    if get_settings().jobs_inline:
        run_job(job.id)
        db.refresh(job)
    else:
        from app.workers.queue import get_queue

        try:
            get_queue().enqueue("app.workers.jobs.run_job", str(job.id), job_timeout=3600)
        except Exception as exc:  # Redis down: fail visibly instead of hanging in "queued"
            job.status = JobStatus.failed
            job.log = f"Could not queue job: {type(exc).__name__}: {exc}"
            job.finished_at = datetime.now(UTC)
            db.commit()
    return job


def run_job(job_id: uuid.UUID | str) -> None:
    from app.services.satellite.pipeline import refresh_survey
    from app.services.weather import refresh_weather

    job_id = uuid.UUID(str(job_id))
    with SessionLocal() as db:
        job = db.get(ProcessingJob, job_id)
        if job is None:
            return
        survey = db.get(Survey, job.survey_id)
        job.status = JobStatus.running
        job.started_at = datetime.now(UTC)
        db.commit()

        def progress(p: float, msg: str) -> None:
            job.progress = round(p, 3)
            job.log = ((job.log or "") + f"{datetime.now(UTC):%H:%M:%S} {msg}\n")[-8000:]
            db.commit()

        try:
            if job.kind == JobKind.satellite:
                result = refresh_survey(db, survey, progress)
            elif job.kind == JobKind.weather:
                result = refresh_weather(db, survey, progress)
            else:
                raise ValueError(f"No runner for job kind {job.kind.value}")
            job.status = JobStatus.done
            job.progress = 1.0
            job.params_json = {**(job.params_json or {}), "result": result}
        except Exception as exc:
            db.rollback()
            job = db.get(ProcessingJob, job_id)
            job.status = JobStatus.failed
            job.log = ((job.log or "") + f"ERROR {type(exc).__name__}: {exc}\n")[-8000:]
            log.error("job %s failed: %s", job_id, traceback.format_exc())
        job.finished_at = datetime.now(UTC)
        db.commit()
