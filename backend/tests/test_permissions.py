"""Permission matrix from SPEC.md Section 7."""
from app.core.permissions import Capability as C
from app.core.permissions import has_capability
from app.db.models import Role


def test_only_field_verifier_submits_verification():
    assert has_capability(Role.field_verifier, C.submit_verification)
    for role in (Role.state_admin, Role.district_officer, Role.drone_operator):
        assert not has_capability(role, C.submit_verification)


def test_final_decision_by_admin_and_officer_only():
    assert has_capability(Role.state_admin, C.final_decision)
    assert has_capability(Role.district_officer, C.final_decision)
    assert not has_capability(Role.drone_operator, C.final_decision)
    assert not has_capability(Role.field_verifier, C.final_decision)


def test_mission_authorization():
    assert has_capability(Role.state_admin, C.authorize_mission)
    assert has_capability(Role.district_officer, C.authorize_mission)
    assert not has_capability(Role.drone_operator, C.authorize_mission)
    assert has_capability(Role.drone_operator, C.request_authorization)
    assert not has_capability(Role.field_verifier, C.authorize_mission)


def test_create_survey_and_upload():
    for role in (Role.state_admin, Role.district_officer, Role.drone_operator):
        assert has_capability(role, C.create_survey)
        assert has_capability(role, C.upload_flight_data)
    assert not has_capability(Role.field_verifier, C.create_survey)
    assert not has_capability(Role.field_verifier, C.upload_flight_data)


def test_user_management_admin_only():
    assert has_capability(Role.state_admin, C.manage_users)
    for role in (Role.district_officer, Role.drone_operator, Role.field_verifier):
        assert not has_capability(role, C.manage_users)


def test_reports():
    for role in (Role.state_admin, Role.district_officer, Role.drone_operator):
        assert has_capability(role, C.view_reports)
    assert not has_capability(Role.field_verifier, C.view_reports)
