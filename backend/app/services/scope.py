"""Row-level data scope per role (SPEC Section 7).

- state_admin: everything
- district_officer: surveys in their own district
- drone_operator: surveys they created
- field_verifier: assigned plots only -> no survey-level access until plot
  assignments exist (Phase 7)
"""
from __future__ import annotations

import uuid

from sqlalchemy import Select, false, select
from sqlalchemy.orm import Session

from app.db.models import Role, Survey, User


def scope_surveys(stmt: Select, user: User) -> Select:
    """Restrict a statement that selects from `surveys` to the user's scope."""
    stmt = stmt.where(Survey.deleted_at.is_(None))
    if user.role == Role.state_admin:
        return stmt
    if user.role == Role.district_officer:
        return stmt.where(Survey.district_id == user.district_id)
    if user.role == Role.drone_operator:
        return stmt.where(Survey.created_by == user.id)
    return stmt.where(false())


def visible_survey_ids(db: Session, user: User) -> Select:
    return scope_surveys(select(Survey.id), user)


def get_visible_survey(db: Session, user: User, survey_id: uuid.UUID) -> Survey | None:
    return db.scalar(scope_surveys(select(Survey).where(Survey.id == survey_id), user))
