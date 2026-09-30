"""Missions: listing, pre-flight checklist, authorization (SPEC Section 9).

Mission *creation* and plan exports wrap the flight-planner module
(greenminds_core_modules) and are added when that module is integrated.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit, snapshot
from app.core.config import load_yaml_config
from app.core.deps import get_current_user, require_capability
from app.core.permissions import Capability, has_capability
from app.db.models import (
    Alert,
    AlertSeverity,
    Mission,
    MissionStatus,
    PreflightCheck,
    Survey,
    User,
)
from app.db.session import get_db
from app.services.scope import scope_surveys

router = APIRouter(tags=["missions"])

# Checklist can be edited until the flight starts.
CHECKLIST_OPEN = (MissionStatus.draft, MissionStatus.ready, MissionStatus.authorized)


def checklist_items() -> list[dict[str, Any]]:
    return load_yaml_config("preflight").get("items", [])


class MissionOut(BaseModel):
    id: uuid.UUID
    survey_id: uuid.UUID
    camera_profile: str
    aircraft_profile: str
    altitude_m: float
    front_overlap: float
    side_overlap: float
    speed_ms: float | None
    heading_deg: float | None
    gsd_cm: float | None
    est_images: int | None
    est_flights: int | None
    est_area_ha: float | None
    status: MissionStatus
    authorized_by: uuid.UUID | None
    authorized_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CheckItemIn(BaseModel):
    item: str
    ok: bool
    value: str | None = Field(default=None, max_length=500)


class PreflightIn(BaseModel):
    items: list[CheckItemIn]


def require_mission(db: Session, user: User, mission_id: uuid.UUID) -> tuple[Mission, Survey]:
    row = db.execute(
        scope_surveys(select(Mission, Survey).join(Survey, Survey.id == Mission.survey_id), user)
        .where(Mission.id == mission_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mission not found")
    return row[0], row[1]


def latest_checks(db: Session, mission_id: uuid.UUID) -> dict[str, PreflightCheck]:
    rows = db.scalars(
        select(PreflightCheck)
        .where(PreflightCheck.mission_id == mission_id)
        .order_by(PreflightCheck.item, PreflightCheck.checked_at.desc(), PreflightCheck.id)
        .distinct(PreflightCheck.item)
    ).all()
    return {r.item: r for r in rows}


def checklist_state(db: Session, mission: Mission, user: User) -> dict[str, Any]:
    latest = latest_checks(db, mission.id)
    items = []
    for spec in checklist_items():
        check = latest.get(spec["key"])
        items.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "telemetry": spec.get("telemetry"),
                "ok": bool(check and check.ok),
                "value": check.value if check else None,
                "checked_at": check.checked_at.isoformat() if check else None,
            }
        )
    all_ok = bool(items) and all(i["ok"] for i in items)
    can_authorize = has_capability(user.role, Capability.authorize_mission)
    return {
        "mission_id": str(mission.id),
        "status": mission.status.value,
        "items": items,
        "all_ok": all_ok,
        "can_authorize": can_authorize,
        "authorize_enabled": all_ok and can_authorize and mission.status == MissionStatus.ready,
        "authorized_by": str(mission.authorized_by) if mission.authorized_by else None,
        "authorized_at": mission.authorized_at.isoformat() if mission.authorized_at else None,
    }


@router.get("/api/surveys/{survey_id}/missions", response_model=list[MissionOut])
def list_missions(survey_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Mission]:
    survey = db.scalar(scope_surveys(select(Survey).where(Survey.id == survey_id), user))
    if survey is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Survey not found")
    return list(db.scalars(select(Mission).where(Mission.survey_id == survey.id).order_by(Mission.created_at)).all())


@router.get("/api/missions/{mission_id}", response_model=MissionOut)
def get_mission(mission_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Mission:
    return require_mission(db, user, mission_id)[0]


@router.get("/api/missions/{mission_id}/preflight")
def get_preflight(mission_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    mission, _ = require_mission(db, user, mission_id)
    return checklist_state(db, mission, user)


@router.post("/api/missions/{mission_id}/preflight")
def submit_preflight(
    mission_id: uuid.UUID,
    body: PreflightIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability(Capability.create_survey)),
) -> dict[str, Any]:
    """Record checklist items (history is kept; the latest entry per item counts)."""
    mission, _ = require_mission(db, user, mission_id)
    if mission.status not in CHECKLIST_OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Checklist is closed for a mission that is {mission.status.value}")
    known = {i["key"] for i in checklist_items()}
    unknown = [c.item for c in body.items if c.item not in known]
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown checklist items: {', '.join(unknown)}")
    before = snapshot(mission)
    now = datetime.now(UTC)
    for c in body.items:
        db.add(PreflightCheck(mission_id=mission.id, item=c.item, ok=c.ok, value=c.value, checked_at=now))
    db.flush()
    state = checklist_state(db, mission, user)
    action = "preflight"
    if state["all_ok"]:
        if mission.status == MissionStatus.draft:
            mission.status = MissionStatus.ready
    elif mission.status in (MissionStatus.ready, MissionStatus.authorized):
        # A failed item after authorization revokes it: conditions changed.
        if mission.status == MissionStatus.authorized:
            action = "authorization_revoked"
        mission.status = MissionStatus.draft
        mission.authorized_by = None
        mission.authorized_at = None
    db.flush()
    record_audit(db, user_id=user.id, action=action, entity="mission", entity_id=mission.id, before=before,
                 after={**snapshot(mission), "items": [c.model_dump() for c in body.items]}, request=request)
    db.commit()
    return checklist_state(db, mission, user)


@router.post("/api/missions/{mission_id}/request-authorization")
def request_authorization(
    mission_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability(Capability.create_survey)),
) -> dict[str, Any]:
    """Drone operators cannot authorize; they ask an officer (creates an alert)."""
    mission, survey = require_mission(db, user, mission_id)
    if mission.status != MissionStatus.ready:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete every checklist item before requesting authorization")
    alert = Alert(kind="authorization_requested", severity=AlertSeverity.info, survey_id=survey.id,
                  message=f"{user.name} requests authorization for a mission of '{survey.name}'.")
    db.add(alert)
    db.flush()
    record_audit(db, user_id=user.id, action="request_authorization", entity="mission", entity_id=mission.id,
                 after={"alert_id": str(alert.id)}, request=request)
    db.commit()
    return {"requested": True, "alert_id": str(alert.id)}


@router.post("/api/missions/{mission_id}/authorize")
def authorize_mission(
    mission_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_capability(Capability.authorize_mission)),
) -> dict[str, Any]:
    mission, _ = require_mission(db, user, mission_id)
    if mission.status == MissionStatus.authorized:
        raise HTTPException(status.HTTP_409_CONFLICT, "Mission is already authorized")
    state = checklist_state(db, mission, user)
    if not state["all_ok"] or mission.status != MissionStatus.ready:
        missing = [i["label"] for i in state["items"] if not i["ok"]]
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"message": "Pre-flight checklist is not complete", "missing": missing},
        )
    before = snapshot(mission)
    mission.status = MissionStatus.authorized
    mission.authorized_by = user.id
    mission.authorized_at = datetime.now(UTC)
    db.flush()
    record_audit(db, user_id=user.id, action="authorize", entity="mission", entity_id=mission.id,
                 before=before, after=snapshot(mission), request=request)
    db.commit()
    return checklist_state(db, mission, user)
