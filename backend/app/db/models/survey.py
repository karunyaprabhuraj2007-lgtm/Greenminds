"""Surveys, missions, flights, images, processing jobs and rasters."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDelete, Timestamps, UUIDPk
from app.db.models.enums import (
    GeotagSource,
    JobKind,
    JobStatus,
    MissionStatus,
    RasterKind,
    SurveyStatus,
    SurveyType,
    pg_enum,
)


class Survey(UUIDPk, Timestamps, SoftDelete, Base):
    """A dated survey of an area. Surveys are never overwritten; each is kept."""

    __tablename__ = "surveys"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[SurveyType] = mapped_column(pg_enum(SurveyType, "survey_type"), nullable=False)
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("districts.id"), index=True, nullable=True
    )
    taluka_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("talukas.id"), index=True, nullable=True
    )
    village_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("villages.id"), index=True, nullable=True
    )
    aoi: Mapped[Any] = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    aoi_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[SurveyStatus] = mapped_column(
        pg_enum(SurveyStatus, "survey_status"), default=SurveyStatus.draft, index=True, nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    survey_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    season: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    missions: Mapped[list[Mission]] = relationship(back_populates="survey")


class Mission(UUIDPk, Timestamps, Base):
    __tablename__ = "missions"

    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False
    )
    camera_profile: Mapped[str] = mapped_column(String(64), nullable=False)
    aircraft_profile: Mapped[str] = mapped_column(String(64), nullable=False)
    altitude_m: Mapped[float] = mapped_column(Float, nullable=False)
    front_overlap: Mapped[float] = mapped_column(Float, nullable=False)
    side_overlap: Mapped[float] = mapped_column(Float, nullable=False)
    speed_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    gsd_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    est_images: Mapped[int | None] = mapped_column(Integer, nullable=True)
    est_flights: Mapped[int | None] = mapped_column(Integer, nullable=True)
    est_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    flights_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    waypoint_files_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[MissionStatus] = mapped_column(
        pg_enum(MissionStatus, "mission_status"), default=MissionStatus.draft, index=True, nullable=False
    )
    authorized_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    survey: Mapped[Survey] = relationship(back_populates="missions")


class PreflightCheck(UUIDPk, Base):
    __tablename__ = "preflight_checks"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    item: Mapped[str] = mapped_column(String(64), nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Flight(UUIDPk, Timestamps, Base):
    __tablename__ = "flights"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    flight_no: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    area_covered_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    images_captured: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rtk_fix_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    log_object_key: Mapped[str | None] = mapped_column(String(512), nullable=True)


class Image(UUIDPk, Timestamps, Base):
    __tablename__ = "images"

    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False
    )
    flight_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("flights.id", ondelete="SET NULL"), nullable=True
    )
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    alt_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    band_set: Mapped[str | None] = mapped_column(String(32), nullable=True)
    geotag_source: Mapped[GeotagSource | None] = mapped_column(
        pg_enum(GeotagSource, "geotag_source"), nullable=True
    )


class ProcessingJob(UUIDPk, Timestamps, Base):
    __tablename__ = "processing_jobs"

    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[JobKind] = mapped_column(pg_enum(JobKind, "job_kind"), nullable=False)
    status: Mapped[JobStatus] = mapped_column(
        pg_enum(JobStatus, "job_status"), default=JobStatus.queued, index=True, nullable=False
    )
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    log: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    params_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class Raster(UUIDPk, Timestamps, Base):
    __tablename__ = "rasters"

    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[RasterKind] = mapped_column(pg_enum(RasterKind, "raster_kind"), nullable=False)
    object_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cog_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    crs: Mapped[str | None] = mapped_column(String(64), nullable=True)
    gsd_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    bounds: Mapped[Any] = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    stats_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    calibrated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Provenance shown on the layer, e.g. "Sentinel-2 L2A", scene id, date, cloud %.
    source: Mapped[str | None] = mapped_column(String(120), nullable=True)
    scene_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    acquired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cloud_cover: Mapped[float | None] = mapped_column(Float, nullable=True)
    attribution: Mapped[str | None] = mapped_column(String(500), nullable=True)
