"""Administrative units: districts -> talukas -> villages.

District officers only see their own district and the units inside it.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.api.pagination import page_params, paginate
from app.api.schemas import Page, PageParams
from app.core.deps import get_current_user
from app.db.models import District, Role, Taluka, User, Village
from app.db.session import get_db
from app.services.geo import bbox, to_geojson

router = APIRouter(prefix="/api/admin-units", tags=["admin-units"])


class AdminUnitOut(BaseModel):
    id: uuid.UUID
    name: str
    parent_id: uuid.UUID | None
    is_demo: bool
    bbox: list[float] | None
    geometry: dict[str, Any] | None = None


def _out(unit: District | Taluka | Village, parent_id: uuid.UUID | None, with_geom: bool) -> AdminUnitOut:
    return AdminUnitOut(
        id=unit.id,
        name=unit.name,
        parent_id=parent_id,
        is_demo=unit.is_demo,
        bbox=bbox(unit.geom),
        geometry=to_geojson(unit.geom) if with_geom else None,
    )


def _district_scope(user: User) -> uuid.UUID | None:
    return user.district_id if user.role == Role.district_officer else None


def _page(db: Session, stmt: Select, params: PageParams, parent: str | None, with_geom: bool) -> Page:
    rows, total = paginate(db, stmt, params)
    items = [_out(r, getattr(r, parent) if parent else None, with_geom) for r in rows]
    return Page(items=items, total=total, page=params.page, page_size=params.page_size)


@router.get("/districts", response_model=Page[AdminUnitOut])
def districts(
    geometry: bool = Query(False, description="Include GeoJSON geometry"),
    params: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page:
    stmt = select(District).order_by(District.name)
    if (scope := _district_scope(user)) is not None:
        stmt = stmt.where(District.id == scope)
    return _page(db, stmt, params, None, geometry)


@router.get("/talukas", response_model=Page[AdminUnitOut])
def talukas(
    district_id: uuid.UUID | None = None,
    geometry: bool = Query(False),
    params: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page:
    stmt = select(Taluka).order_by(Taluka.name)
    if district_id is not None:
        stmt = stmt.where(Taluka.district_id == district_id)
    if (scope := _district_scope(user)) is not None:
        stmt = stmt.where(Taluka.district_id == scope)
    return _page(db, stmt, params, "district_id", geometry)


@router.get("/villages", response_model=Page[AdminUnitOut])
def villages(
    taluka_id: uuid.UUID | None = None,
    geometry: bool = Query(False),
    params: PageParams = Depends(page_params),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Page:
    stmt = select(Village).order_by(Village.name)
    if taluka_id is not None:
        stmt = stmt.where(Village.taluka_id == taluka_id)
    if (scope := _district_scope(user)) is not None:
        stmt = stmt.join(Taluka, Village.taluka_id == Taluka.id).where(Taluka.district_id == scope)
    return _page(db, stmt, params, "taluka_id", geometry)
