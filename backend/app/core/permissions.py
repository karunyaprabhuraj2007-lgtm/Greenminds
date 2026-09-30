"""Role -> capability matrix (SPEC.md Section 7).

This is the single source of truth: the API enforces it and `/api/auth/me`
returns the caller's capabilities so the frontend can build a role-aware menu.
"""
from __future__ import annotations

from enum import Enum

from app.db.models.enums import Role


class Capability(str, Enum):
    view_dashboard = "view_dashboard"
    view_map = "view_map"
    create_survey = "create_survey"          # also create mission
    authorize_mission = "authorize_mission"
    request_authorization = "request_authorization"
    upload_flight_data = "upload_flight_data"
    fly_mission = "fly_mission"              # live mission screen
    view_processing = "view_processing"
    view_plot_intelligence = "view_plot_intelligence"
    submit_verification = "submit_verification"
    final_decision = "final_decision"
    review_verifications = "review_verifications"
    manage_users = "manage_users"
    view_reports = "view_reports"
    view_audit_log = "view_audit_log"


_ALL = set(Capability)

ROLE_CAPABILITIES: dict[Role, frozenset[Capability]] = {
    Role.state_admin: frozenset(_ALL - {Capability.submit_verification, Capability.request_authorization}),
    Role.district_officer: frozenset(
        _ALL
        - {
            Capability.submit_verification,
            Capability.request_authorization,
            Capability.manage_users,
            Capability.view_audit_log,
        }
    ),
    Role.drone_operator: frozenset(
        {
            Capability.view_dashboard,
            Capability.view_map,
            Capability.create_survey,
            Capability.request_authorization,
            Capability.upload_flight_data,
            Capability.fly_mission,
            Capability.view_processing,
            Capability.view_plot_intelligence,
            Capability.view_reports,  # own surveys only
        }
    ),
    Role.field_verifier: frozenset(
        {
            Capability.submit_verification,
            Capability.view_plot_intelligence,  # assigned plots only
        }
    ),
}


def capabilities_for(role: Role) -> list[str]:
    return sorted(c.value for c in ROLE_CAPABILITIES[role])


def has_capability(role: Role, capability: Capability) -> bool:
    return capability in ROLE_CAPABILITIES[role]
