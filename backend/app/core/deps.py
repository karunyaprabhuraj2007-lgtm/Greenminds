"""FastAPI dependencies: DB session, current user, role/capability guards."""
from __future__ import annotations

import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.permissions import Capability, has_capability
from app.core.security import decode_token
from app.db.models import Role, User
from app.db.session import get_db

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(message: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _unauthorized()
    try:
        payload = decode_token(creds.credentials, "access")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise _unauthorized("Invalid or expired token") from None
    user = db.get(User, user_id)
    if user is None or not user.active:
        raise _unauthorized("User not found or inactive")
    return user


def require_roles(*roles: Role) -> Callable[..., User]:
    """Allow only the listed roles."""

    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role does not allow this action")
        return user

    return _dep


def require_capability(capability: Capability) -> Callable[..., User]:
    """Allow roles that hold `capability` in the permission matrix."""

    def _dep(user: User = Depends(get_current_user)) -> User:
        if not has_capability(user.role, capability):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role does not allow this action")
        return user

    return _dep


ALL_ROLES = tuple(Role)
