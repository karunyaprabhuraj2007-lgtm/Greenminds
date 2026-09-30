import uuid

from sqlalchemy import select

from app.db.models import AuditLog
from tests.conftest import ADMIN, OFFICER, VERIFIER, auth_header


def test_list_alerts(client, tokens):
    res = client.get("/api/alerts", headers=auth_header(tokens, OFFICER))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 2 and all(a["is_demo"] for a in items)


def test_mark_alert_read_is_audited(client, tokens, db):
    h = auth_header(tokens, ADMIN)
    alert = client.get("/api/alerts?unread=true", headers=h).json()["items"][0]
    res = client.patch(f"/api/alerts/{alert['id']}", headers=h, json={"read": True})
    assert res.status_code == 200 and res.json()["read"] is True
    assert all(a["id"] != alert["id"] for a in client.get("/api/alerts?unread=true", headers=h).json()["items"])
    row = db.scalar(select(AuditLog).where(AuditLog.entity == "alert", AuditLog.entity_id == alert["id"]))
    assert row.before_json["read"] is False and row.after_json["read"] is True
    client.patch(f"/api/alerts/{alert['id']}", headers=h, json={"read": False})


def test_alerts_permissions(client, tokens):
    assert client.get("/api/alerts", headers=auth_header(tokens, VERIFIER)).status_code == 403
    assert client.patch(f"/api/alerts/{uuid.uuid4()}", headers=auth_header(tokens, ADMIN), json={"read": True}).status_code == 404
