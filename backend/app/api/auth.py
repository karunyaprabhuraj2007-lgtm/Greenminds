"""Authentication: login, token refresh, current user."""
from __future__ import annotations

import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.users import UserOut
from app.core.audit import record_audit
from app.core.deps import get_current_user
from app.core.permissions import capabilities_for
from app.core.security import create_token, decode_token, verify_password
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class MeOut(UserOut):
    capabilities: list[str]


def _tokens(user: User) -> TokenOut:
    return TokenOut(
        access_token=create_token(user.id, user.role.value, "access"),
        refresh_token=create_token(user.id, user.role.value, "refresh"),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)) -> TokenOut:
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if user is None or not user.active or not verify_password(body.password, user.password_hash):
        record_audit(
            db,
            user_id=user.id if user else None,
            action="login_failed",
            entity="user",
            entity_id=user.id if user else None,
            after={"email": body.email},
            request=request,
        )
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    record_audit(db, user_id=user.id, action="login", entity="user", entity_id=user.id, request=request)
    db.commit()
    return _tokens(user)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)) -> TokenOut:
    try:
        payload = decode_token(body.refresh_token, "refresh")
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token") from None
    if user is None or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return _tokens(user)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)) -> MeOut:
    base = UserOut.model_validate(user).model_dump()
    return MeOut(**base, capabilities=capabilities_for(user.role))
