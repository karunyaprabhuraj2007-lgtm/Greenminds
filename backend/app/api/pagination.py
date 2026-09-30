"""Consistent pagination for list endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.api.schemas import PageParams


def page_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


def paginate(db: Session, stmt: Select, params: PageParams) -> tuple[list[Any], int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.offset(params.offset).limit(params.page_size)).all()
    return list(rows), int(total)
