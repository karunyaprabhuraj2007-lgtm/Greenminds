"""Liveness / readiness."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    postgis = db.scalar(text("SELECT postgis_lib_version()"))
    settings = get_settings()
    return {
        "status": "ok",
        "database": "ok",
        "postgis": postgis,
        "demo_mode": settings.demo_mode,
        "telemetry_mode": settings.telemetry_mode,
    }
