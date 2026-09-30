import uuid

import pytest
from sqlalchemy import select

from app.db.models import Alert, AlertSeverity, AuditLog
from tests.conftest import ADMIN, OFFICER, VERIFIER, auth_header


@pytest.fixture()
def alert(db, world):
    a = Alert(kind="processing_done", severity=AlertSeverity.info, message="Test alert", survey_id=uuid.UUID(world["new"]["id"]))
    db.add(a)
    db.commit()
    return a


def test_list_alerts(client, tokens, alert):
    items = client.get("/api/alerts", headers=auth_header(tokens, OFFICER)).json()["items"]
    assert any(a["id"] == str(alert.id) and a["is_demo"] is False for a in items)


def test_alert_scope(client, tokens, db, world):
    other = Alert(kind="x", severity=AlertSeverity.info, message="Nashik only", survey_id=uuid.UUID(world["nashik"]))
    db.add(other)
    db.commit()
    ids = [a["id"] for a in client.get("/api/alerts?page_size=200", headers=auth_header(tokens, OFFICER)).json()["items"]]
    assert str(other.id) not in ids


def test_mark_alert_read_is_audited(client, tokens, db, alert):
    h = auth_header(tokens, ADMIN)
    res = client.patch(f"/api/alerts/{alert.id}", headers=h, json={"read": True})
    assert res.status_code == 200 and res.json()["read"] is True
    unread = [a["id"] for a in client.get("/api/alerts?unread=true&page_size=200", headers=h).json()["items"]]
    assert str(alert.id) not in unread
    row = db.scalar(select(AuditLog).where(AuditLog.entity == "alert", AuditLog.entity_id == str(alert.id)))
    assert row.before_json["read"] is False and row.after_json["read"] is True


def test_alerts_permissions(client, tokens):
    assert client.get("/api/alerts", headers=auth_header(tokens, VERIFIER)).status_code == 403
    assert client.patch(f"/api/alerts/{uuid.uuid4()}", headers=auth_header(tokens, ADMIN), json={"read": True}).status_code == 404
