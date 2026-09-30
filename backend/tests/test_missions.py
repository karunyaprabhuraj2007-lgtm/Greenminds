import uuid

import pytest
from sqlalchemy import select

from app.core.config import load_yaml_config
from app.db.models import Alert, AuditLog, Mission, MissionStatus
from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header

KEYS = [i["key"] for i in load_yaml_config("preflight")["items"]]


@pytest.fixture()
def mission(db, world):
    """A mission row on the newest Baramati survey (created directly: mission
    creation wraps the flight planner, integrated separately)."""
    m = Mission(survey_id=uuid.UUID(world["new"]["id"]), camera_profile="survey3w_rgn", aircraft_profile="agroscan_quad",
                altitude_m=100, front_overlap=0.8, side_overlap=0.7)
    db.add(m)
    db.commit()
    return m


def _submit(client, tokens, mission_id, ok=True, email=OPERATOR, keys=KEYS):
    items = [{"item": k, "ok": ok, "value": "checked"} for k in keys]
    return client.post(f"/api/missions/{mission_id}/preflight", json={"items": items}, headers=auth_header(tokens, email))


def test_get_mission_and_list(client, tokens, mission):
    h = auth_header(tokens, OFFICER)
    assert client.get(f"/api/missions/{mission.id}", headers=h).json()["status"] == "draft"
    ids = [m["id"] for m in client.get(f"/api/surveys/{mission.survey_id}/missions", headers=h).json()]
    assert str(mission.id) in ids
    assert client.get(f"/api/missions/{uuid.uuid4()}", headers=h).status_code == 404
    assert client.get(f"/api/surveys/{uuid.uuid4()}/missions", headers=h).status_code == 404


def test_checklist_template_from_config(client, tokens, mission):
    state = client.get(f"/api/missions/{mission.id}/preflight", headers=auth_header(tokens, OPERATOR)).json()
    assert [i["key"] for i in state["items"]] == KEYS
    assert state["all_ok"] is False and state["authorize_enabled"] is False
    assert state["can_authorize"] is False  # drone operator: request only


def test_partial_checklist_keeps_authorize_disabled(client, tokens, mission):
    res = _submit(client, tokens, mission.id, keys=KEYS[:3])
    assert res.status_code == 200
    assert res.json()["all_ok"] is False and res.json()["status"] == "draft"
    res = client.post(f"/api/missions/{mission.id}/authorize", headers=auth_header(tokens, OFFICER))
    assert res.status_code == 409
    assert len(res.json()["error"]["details"]["missing"]) == len(KEYS) - 3


def test_full_flow_request_and_authorize(client, tokens, mission, db):
    state = _submit(client, tokens, mission.id).json()
    assert state["all_ok"] is True and state["status"] == "ready"

    # Operator cannot authorize, only request.
    assert client.post(f"/api/missions/{mission.id}/authorize", headers=auth_header(tokens, OPERATOR)).status_code == 403
    req = client.post(f"/api/missions/{mission.id}/request-authorization", headers=auth_header(tokens, OPERATOR))
    assert req.status_code == 200
    assert db.get(Alert, uuid.UUID(req.json()["alert_id"])).kind == "authorization_requested"

    officer_state = client.get(f"/api/missions/{mission.id}/preflight", headers=auth_header(tokens, OFFICER)).json()
    assert officer_state["authorize_enabled"] is True
    res = client.post(f"/api/missions/{mission.id}/authorize", headers=auth_header(tokens, OFFICER))
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "authorized" and body["authorized_by"] and body["authorized_at"]
    assert client.post(f"/api/missions/{mission.id}/authorize", headers=auth_header(tokens, OFFICER)).status_code == 409

    actions = [r.action for r in db.scalars(select(AuditLog).where(AuditLog.entity_id == str(mission.id)).order_by(AuditLog.at))]
    assert actions == ["preflight", "request_authorization", "authorize"]


def test_failed_item_after_authorization_revokes_it(client, tokens, mission, db):
    _submit(client, tokens, mission.id)
    client.post(f"/api/missions/{mission.id}/authorize", headers=auth_header(tokens, ADMIN))
    res = _submit(client, tokens, mission.id, ok=False, keys=["weather"])
    assert res.json()["status"] == "draft" and res.json()["authorized_by"] is None
    db.expire_all()
    assert db.get(Mission, mission.id).status == MissionStatus.draft
    row = db.scalar(select(AuditLog).where(AuditLog.entity_id == str(mission.id), AuditLog.action == "authorization_revoked"))
    assert row is not None


def test_checklist_validation_and_permissions(client, tokens, mission):
    res = client.post(f"/api/missions/{mission.id}/preflight", json={"items": [{"item": "coffee", "ok": True}]},
                      headers=auth_header(tokens, OPERATOR))
    assert res.status_code == 422
    assert _submit(client, tokens, mission.id, email=VERIFIER).status_code == 403
    assert client.post(f"/api/missions/{mission.id}/request-authorization", headers=auth_header(tokens, OPERATOR)).status_code == 409


def test_checklist_closed_after_flight(client, tokens, mission, db):
    mission.status = MissionStatus.completed
    db.commit()
    assert _submit(client, tokens, mission.id).status_code == 409


def test_mission_scope(client, tokens, mission, world, db):
    m = Mission(survey_id=uuid.UUID(world["nashik"]), camera_profile="survey3w_rgn", aircraft_profile="agroscan_quad",
                altitude_m=100, front_overlap=0.8, side_overlap=0.7)
    db.add(m)
    db.commit()
    assert client.get(f"/api/missions/{m.id}", headers=auth_header(tokens, OFFICER)).status_code == 404
    assert client.get(f"/api/missions/{m.id}", headers=auth_header(tokens, ADMIN)).status_code == 200
