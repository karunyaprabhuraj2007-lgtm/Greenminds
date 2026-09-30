"""Audit logging. Every mutating endpoint calls `record_audit` inside its
transaction so the audit row commits (or rolls back) with the change."""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Any

from fastapi import Request
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.db.models import AuditLog

_SECRET_FIELDS = {"password", "password_hash"}


def _jsonable(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    # Geometry / other opaque values: keep the audit row small and safe.
    return str(type(value).__name__)


def snapshot(obj: Any) -> dict[str, Any]:
    """Column snapshot of an ORM object with secrets and geometries removed."""
    mapper = inspect(obj).mapper
    out: dict[str, Any] = {}
    for attr in mapper.column_attrs:
        key = attr.key
        if key in _SECRET_FIELDS:
            continue
        value = getattr(obj, key)
        if type(value).__module__.startswith("geoalchemy2"):
            continue
        out[key] = _jsonable(value)
    return out


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def record_audit(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    action: str,
    entity: str,
    entity_id: Any = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    request: Request | None = None,
) -> AuditLog:
    row = AuditLog(
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        before_json=_jsonable(before) if before is not None else None,
        after_json=_jsonable(after) if after is not None else None,
        ip=client_ip(request),
    )
    db.add(row)
    return row
