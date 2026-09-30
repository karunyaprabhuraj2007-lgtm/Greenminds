"""Import every model so Alembic and `Base.metadata` see the full schema."""
from app.db.models.core import AuditLog, Dataset, District, Taluka, User, Village
from app.db.models.observation import SatelliteObservation, WeatherDaily
from app.db.models.enums import (
    AlertSeverity,
    DamageClass,
    GeotagSource,
    HealthClass,
    JobKind,
    JobStatus,
    MissionStatus,
    RasterKind,
    Role,
    SurveyStatus,
    SurveyType,
    VerificationDecision,
)
from app.db.models.plot import (
    Alert,
    DamageAssessment,
    Plot,
    PlotAIResult,
    PlotVerification,
    Report,
)
from app.db.models.survey import (
    Flight,
    Image,
    Mission,
    PreflightCheck,
    ProcessingJob,
    Raster,
    Survey,
)

__all__ = [
    "Alert", "AlertSeverity", "AuditLog", "Dataset", "SatelliteObservation", "WeatherDaily", "DamageAssessment", "DamageClass", "District",
    "Flight", "GeotagSource", "HealthClass", "Image", "JobKind", "JobStatus", "Mission",
    "MissionStatus", "Plot", "PlotAIResult", "PlotVerification", "PreflightCheck",
    "ProcessingJob", "Raster", "RasterKind", "Report", "Role", "Survey", "SurveyStatus",
    "SurveyType", "Taluka", "User", "VerificationDecision", "Village",
]
