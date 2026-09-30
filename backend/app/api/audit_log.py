"""Read-only audit log (state admin only)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.pagination import page_params, paginate
from app.api.schemas import ORMModel, Page, PageParams
from app.core.deps import require_capability
from app.core.permissions import Capability
from app.db.models import AuditLog, User
from app.db.session import get_db

router = APIRouter(prefix="/api/audit-log", tags=["audit"])


class AuditOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    entity: str
    entity_id: str | None
    before_json: dict[str, Any] | None
    after_json: dict[str, Any] | None
    ip: str | None
    at: datetime


@router.get("", response_model=Page[AuditOut])
def list_audit(
    entity: str | None = None,
    action: str | None = None,
    user_id: uuid.UUID | None = None,
    params: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    _: User = Depends(require_capability(Capability.view_audit_log)),
) -> Page[AuditOut]:
    stmt = select(AuditLog).order_by(AuditLog.at.desc(), AuditLog.id)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    rows, total = paginate(db, stmt, params)
    return Page(items=rows, total=total, page=params.page, page_size=params.page_size)
