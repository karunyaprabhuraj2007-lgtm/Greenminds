"""External observations: Sentinel-2 NDVI time series and daily weather."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPk


class SatelliteObservation(UUIDPk, Base):
    """NDVI statistics of one Sentinel-2 scene over a survey AOI (plot_id NULL)
    or over one plot. Stats are NULL when no pixel was cloud-free."""

    __tablename__ = "satellite_observations"
    __table_args__ = (
        Index("uq_satobs_survey_scene", "survey_id", "scene_id", unique=True, postgresql_where=text("plot_id IS NULL")),
        Index("uq_satobs_plot_scene", "plot_id", "scene_id", unique=True, postgresql_where=text("plot_id IS NOT NULL")),
    )

    survey_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False)
    plot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plots.id", ondelete="CASCADE"), index=True, nullable=True)
    collection: Mapped[str] = mapped_column(String(64), nullable=False)
    scene_id: Mapped[str] = mapped_column(String(120), nullable=False)
    platform: Mapped[str | None] = mapped_column(String(40), nullable=True)
    scene_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    acquired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scene_cloud_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    clear_fraction: Mapped[float] = mapped_column(Float, nullable=False)
    valid_pixels: Mapped[int] = mapped_column(Integer, nullable=False)
    total_pixels: Mapped[int] = mapped_column(Integer, nullable=False)
    ndvi_mean: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_p10: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_p90: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WeatherDaily(UUIDPk, Base):
    """Daily weather at the survey AOI centroid (Open-Meteo)."""

    __tablename__ = "weather_daily"
    __table_args__ = (UniqueConstraint("survey_id", "day", name="uq_weather_daily_survey_day"),)

    survey_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    precip_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    tmax_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    tmin_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # archive | forecast
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
