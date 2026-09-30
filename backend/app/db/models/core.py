"""Users, administrative units and the audit log."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPk
from app.db.models.enums import Role, pg_enum


class Dataset(UUIDPk, Timestamps, Base):
    """An external dataset with its provenance, licence and attribution."""

    __tablename__ = "datasets"

    key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    provider: Mapped[str] = mapped_column(String(200), nullable=False)
    original_source: Mapped[str | None] = mapped_column(String(300), nullable=True)
    licence: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attribution: Mapped[str] = mapped_column(String(500), nullable=False)
    version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class District(UUIDPk, Timestamps, Base):
    __tablename__ = "districts"

    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    geom: Mapped[Any] = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    # True when the boundary is a simplified demo geometry, not an official one.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)

    talukas: Mapped[list[Taluka]] = relationship(back_populates="district")


class Taluka(UUIDPk, Timestamps, Base):
    __tablename__ = "talukas"

    district_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("districts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    geom: Mapped[Any] = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)

    district: Mapped[District] = relationship(back_populates="talukas")
    villages: Mapped[list[Village]] = relationship(back_populates="taluka")


class Village(UUIDPk, Timestamps, Base):
    __tablename__ = "villages"

    taluka_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("talukas.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    geom: Mapped[Any] = mapped_column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dataset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)

    taluka: Mapped[Taluka] = relationship(back_populates="villages")


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(pg_enum(Role, "user_role"), nullable=False)
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("districts.id", ondelete="SET NULL"), nullable=True
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    district: Mapped[District | None] = relationship()


class AuditLog(UUIDPk, Base):
    __tablename__ = "audit_log"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    before_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )
