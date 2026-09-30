"""Start-up data load (idempotent).

- Always: real Maharashtra district / taluka boundaries (geoBoundaries).
- When SEED_DEMO_DATA=true: one demo user account per role. No survey, plot,
  result or alert is ever seeded; every number in the UI comes from data
  users create or from external sources (Sentinel-2, Open-Meteo).

Run: python -m app.seed.seed
"""
from __future__ import annotations

import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.models import District, Role, User
from app.db.session import SessionLocal
from app.seed.boundaries_import import import_boundaries

DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "GreenMinds@2026")

DEMO_USERS = [
    ("State Admin", "admin@greenminds.demo", Role.state_admin, None),
    ("Pune District Officer", "officer.pune@greenminds.demo", Role.district_officer, "Pune"),
    ("Drone Operator", "operator@greenminds.demo", Role.drone_operator, "Pune"),
    ("Field Verifier", "verifier@greenminds.demo", Role.field_verifier, "Pune"),
]


def seed_demo_users(db: Session) -> None:
    for name, email, role, district_name in DEMO_USERS:
        district = db.scalar(select(District).where(District.name == district_name)) if district_name else None
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, password_hash=hash_password(DEMO_PASSWORD), role=role, active=True, is_demo=True)
            db.add(user)
        user.name = name
        if district is not None and user.district_id is None:
            user.district_id = district.id
    db.flush()


def seed(db: Session, demo_users: bool = True) -> None:
    import_boundaries(db)
    if demo_users:
        seed_demo_users(db)
    db.commit()


def main() -> None:
    demo = os.environ.get("SEED_DEMO_DATA", "true").lower() == "true"
    with SessionLocal() as db:
        seed(db, demo_users=demo)
    print(f"Seed complete: real boundaries imported; demo users {'present' if demo else 'skipped'}.")


if __name__ == "__main__":
    main()
