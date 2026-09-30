"""Enumerations shared by models and API schemas."""
from __future__ import annotations

import enum

from sqlalchemy import Enum as SAEnum


class Role(str, enum.Enum):
    state_admin = "state_admin"
    district_officer = "district_officer"
    drone_operator = "drone_operator"
    field_verifier = "field_verifier"


class SurveyType(str, enum.Enum):
    crop_survey = "crop_survey"
    crop_health = "crop_health"
    damage_assessment = "damage_assessment"
    insurance_verification = "insurance_verification"
    subsidy_verification = "subsidy_verification"


class SurveyStatus(str, enum.Enum):
    draft = "draft"
    planned = "planned"
    flying = "flying"
    uploaded = "uploaded"
    processing = "processing"
    processed = "processed"
    verified = "verified"
    archived = "archived"


class MissionStatus(str, enum.Enum):
    draft = "draft"
    ready = "ready"
    authorized = "authorized"
    in_flight = "in_flight"
    completed = "completed"
    cancelled = "cancelled"


class GeotagSource(str, enum.Enum):
    exif = "exif"
    log = "log"
    manual = "manual"


class JobKind(str, enum.Enum):
    validate = "validate"
    geotag = "geotag"
    calibrate = "calibrate"
    photogrammetry = "photogrammetry"
    indices = "indices"
    plots = "plots"
    classify = "classify"
    damage = "damage"
    report = "report"
    satellite = "satellite"
    weather = "weather"


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class RasterKind(str, enum.Enum):
    orthomosaic = "orthomosaic"
    dsm = "dsm"
    dtm = "dtm"
    ndvi = "ndvi"
    gndvi = "gndvi"
    ndre = "ndre"
    stress = "stress"
    damage = "damage"


class HealthClass(str, enum.Enum):
    healthy = "healthy"
    moderate = "moderate"
    severe = "severe"


class VerificationDecision(str, enum.Enum):
    verified = "verified"
    needs_review = "needs_review"
    rejected = "rejected"


class DamageClass(str, enum.Enum):
    none = "none"
    low = "low"
    moderate = "moderate"
    severe = "severe"


class AlertSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Postgres enum storing the enum *values* (lower-case strings)."""
    return SAEnum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])
