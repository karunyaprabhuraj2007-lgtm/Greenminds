"""User management (state admin only)."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.pagination import page_params, paginate
from app.api.schemas import ORMModel, Page, PageParams
from app.core.audit import record_audit, snapshot
from app.core.deps import require_capability
from app.core.permissions import Capability
from app.core.security import hash_password
from app.db.models import District, Role, User
from app.db.session import get_db

router = APIRouter(prefix="/api/users", tags=["users"])

_admin = require_capability(Capability.manage_users)


class UserOut(ORMModel):
    id: uuid.UUID
    name: str
    email: str
    role: Role
    district_id: uuid.UUID | None
    active: bool
    is_demo: bool
    created_at: datetime


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role
    district_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    district_id: uuid.UUID | None = None
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


def _check_district(db: Session, role: Role, district_id: uuid.UUID | None) -> None:
    if district_id is not None and db.get(District, district_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown district_id")
    if role == Role.district_officer and district_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "District officers must have a district_id")


@router.get("", response_model=Page[UserOut])
def list_users(
    params: PageParams = Depends(page_params),
    role: Role | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(_admin),
) -> Page[UserOut]:
    stmt = select(User).order_by(User.created_at, User.email)
    if role is not None:
        stmt = stmt.where(User.role == role)
    rows, total = paginate(db, stmt, params)
    return Page(items=rows, total=total, page=params.page, page_size=params.page_size)


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(_admin)) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(_admin),
) -> User:
    if db.scalar(select(User.id).where(func.lower(User.email) == body.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    _check_district(db, body.role, body.district_id)
    user = User(
        name=body.name,
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role=body.role,
        district_id=body.district_id,
        active=True,
    )
    db.add(user)
    db.flush()
    record_audit(
        db, user_id=actor.id, action="create", entity="user", entity_id=user.id,
        after=snapshot(user), request=request,
    )
    db.commit()
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(_admin),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    before = snapshot(user)
    changes = body.model_dump(exclude_unset=True)
    if user.id == actor.id and (changes.get("active") is False or changes.get("role") not in (None, actor.role)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate or demote yourself")
    password = changes.pop("password", None)
    for key, value in changes.items():
        setattr(user, key, value)
    _check_district(db, user.role, user.district_id)
    if password:
        user.password_hash = hash_password(password)
    db.flush()
    after = snapshot(user)
    if password:
        after["password_changed"] = True
    record_audit(
        db, user_id=actor.id, action="update", entity="user", entity_id=user.id,
        before=before, after=after, request=request,
    )
    db.commit()
    return user
