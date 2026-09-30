"""Alerts feed."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.pagination import page_params, paginate
from app.api.schemas import ORMModel, Page, PageParams
from app.core.audit import record_audit, snapshot
from app.core.deps import require_capability
from app.core.permissions import Capability
from app.db.models import Alert, AlertSeverity, Role, User
from app.db.session import get_db
from app.services.scope import visible_survey_ids

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

_viewer = require_capability(Capability.view_dashboard)


class AlertOut(ORMModel):
    id: uuid.UUID
    kind: str
    severity: AlertSeverity
    message: str
    survey_id: uuid.UUID | None
    plot_id: uuid.UUID | None
    read: bool
    is_demo: bool
    created_at: datetime


class AlertUpdate(BaseModel):
    read: bool


def _scoped(stmt, db: Session, user: User):
    visible = visible_survey_ids(db, user)
    if user.role == Role.state_admin:
        return stmt
    # System-wide alerts (no survey) are visible to every dashboard user.
    return stmt.where(or_(Alert.survey_id.is_(None), Alert.survey_id.in_(visible)))


@router.get("", response_model=Page[AlertOut])
def list_alerts(
    unread: bool | None = None,
    params: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    user: User = Depends(_viewer),
) -> Page[AlertOut]:
    stmt = _scoped(select(Alert), db, user).order_by(Alert.created_at.desc())
    if unread is not None:
        stmt = stmt.where(Alert.read.is_(not unread))
    rows, total = paginate(db, stmt, params)
    return Page(items=rows, total=total, page=params.page, page_size=params.page_size)


@router.patch("/{alert_id}", response_model=AlertOut)
def update_alert(
    alert_id: uuid.UUID,
    body: AlertUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(_viewer),
) -> Alert:
    alert = db.scalar(_scoped(select(Alert), db, user).where(Alert.id == alert_id))
    if alert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    before = snapshot(alert)
    alert.read = body.read
    db.flush()
    record_audit(db, user_id=user.id, action="update", entity="alert", entity_id=alert.id,
                 before=before, after=snapshot(alert), request=request)
    db.commit()
    return alert
