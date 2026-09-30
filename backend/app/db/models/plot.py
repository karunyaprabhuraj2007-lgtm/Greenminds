"""Plots, AI results, human verifications, damage, alerts and reports.

AI results (`plot_ai_results`) and human verifications (`plot_verifications`)
are deliberately separate tables: a verification never overwrites an AI result.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk
from app.db.models.enums import (
    AlertSeverity,
    DamageClass,
    HealthClass,
    VerificationDecision,
    pg_enum,
)


class Plot(UUIDPk, Timestamps, Base):
    __tablename__ = "plots"
    __table_args__ = (UniqueConstraint("survey_id", "plot_code", name="uq_plots_survey_code"),)

    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False
    )
    plot_code: Mapped[str] = mapped_column(String(64), nullable=False)
    geom: Mapped[Any] = mapped_column(Geometry("POLYGON", srid=4326), nullable=False)
    area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    village_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("villages.id", ondelete="SET NULL"), index=True, nullable=True
    )
    parcel_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Auto-generated plots are candidates until an officer confirms them.
    is_candidate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Provenance: "drawn" or "import:<filename>" (geometry is never invented).
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class PlotAIResult(UUIDPk, Timestamps, Base):
    __tablename__ = "plot_ai_results"

    plot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plots.id", ondelete="CASCADE"), index=True, nullable=False
    )
    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False
    )
    crop_pred: Mapped[str | None] = mapped_column(String(64), nullable=True)
    crop_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_mean: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_p10: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_p90: Mapped[float | None] = mapped_column(Float, nullable=True)
    health_class: Mapped[HealthClass | None] = mapped_column(
        pg_enum(HealthClass, "health_class"), nullable=True
    )
    stress_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    damage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class PlotVerification(UUIDPk, Timestamps, Base):
    __tablename__ = "plot_verifications"

    plot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plots.id", ondelete="CASCADE"), index=True, nullable=False
    )
    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False
    )
    verifier_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actual_crop: Mapped[str | None] = mapped_column(String(64), nullable=True)
    crop_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    health_class: Mapped[HealthClass | None] = mapped_column(
        pg_enum(HealthClass, "health_class"), nullable=True
    )
    damage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_keys: Mapped[list[str]] = mapped_column(ARRAY(String(512)), default=list, nullable=False)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision: Mapped[VerificationDecision | None] = mapped_column(
        pg_enum(VerificationDecision, "verification_decision"), nullable=True
    )
    client_uuid: Mapped[uuid.UUID] = mapped_column(unique=True, nullable=False)


class DamageAssessment(UUIDPk, Timestamps, Base):
    __tablename__ = "damage_assessments"

    plot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plots.id", ondelete="CASCADE"), index=True, nullable=False
    )
    before_survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )
    after_survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False
    )
    ndvi_before: Mapped[float | None] = mapped_column(Float, nullable=True)
    ndvi_after: Mapped[float | None] = mapped_column(Float, nullable=True)
    delta: Mapped[float | None] = mapped_column(Float, nullable=True)
    damage_class: Mapped[DamageClass | None] = mapped_column(
        "class", pg_enum(DamageClass, "damage_class"), nullable=True
    )


class Alert(UUIDPk, Timestamps, Base):
    __tablename__ = "alerts"

    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(
        pg_enum(AlertSeverity, "alert_severity"), default=AlertSeverity.info, nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    survey_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=True
    )
    plot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plots.id", ondelete="CASCADE"), index=True, nullable=True
    )
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Report(UUIDPk, Timestamps, Base):
    __tablename__ = "reports"

    survey_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("surveys.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    object_key_pdf: Mapped[str | None] = mapped_column(String(512), nullable=True)
    object_key_csv: Mapped[str | None] = mapped_column(String(512), nullable=True)
    object_key_geojson: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
