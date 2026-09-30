from sqlalchemy import select

from app.core.security import create_token
from app.db.models import AuditLog
from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header, login


def test_login_each_role(client):
    for email, role in [
        (ADMIN, "state_admin"),
        (OFFICER, "district_officer"),
        (OPERATOR, "drone_operator"),
        (VERIFIER, "field_verifier"),
    ]:
        body = login(client, email)
        assert body["token_type"] == "bearer"
        assert body["user"]["role"] == role
        assert body["user"]["is_demo"] is True


def test_login_is_case_insensitive_on_email(client):
    body = login(client, ADMIN.upper())
    assert body["user"]["email"] == ADMIN


def test_login_wrong_password_is_401_and_audited(client, db):
    res = client.post("/api/auth/login", json={"email": OFFICER, "password": "wrong-password"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"
    row = db.scalar(
        select(AuditLog).where(AuditLog.action == "login_failed").order_by(AuditLog.at.desc())
    )
    assert row is not None and row.after_json["email"] == OFFICER


def test_login_unknown_user_is_401(client):
    res = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})
    assert res.status_code == 401


def test_login_validation_error_format(client):
    res = client.post("/api/auth/login", json={"email": "not-an-email"})
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "validation_error"
    assert isinstance(err["details"], list)


def test_successful_login_is_audited(client, db):
    login(client, VERIFIER)
    row = db.scalar(select(AuditLog).where(AuditLog.action == "login").order_by(AuditLog.at.desc()))
    assert row is not None


def test_me_returns_capabilities(client, tokens):
    res = client.get("/api/auth/me", headers=auth_header(tokens, VERIFIER))
    assert res.status_code == 200
    caps = res.json()["capabilities"]
    assert "submit_verification" in caps
    assert "manage_users" not in caps

    admin_caps = client.get("/api/auth/me", headers=auth_header(tokens, ADMIN)).json()["capabilities"]
    assert "manage_users" in admin_caps and "view_audit_log" in admin_caps
    assert "submit_verification" not in admin_caps


def test_me_requires_token(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_me_rejects_garbage_and_refresh_tokens(client, tokens):
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer abc"}).status_code == 401
    refresh = tokens[ADMIN]["refresh_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {refresh}"}).status_code == 401


def test_refresh_issues_new_tokens(client, tokens):
    res = client.post("/api/auth/refresh", json={"refresh_token": tokens[OPERATOR]["refresh_token"]})
    assert res.status_code == 200
    new_access = res.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.json()["email"] == OPERATOR


def test_refresh_rejects_access_token(client, tokens):
    res = client.post("/api/auth/refresh", json={"refresh_token": tokens[OPERATOR]["access_token"]})
    assert res.status_code == 401


def test_token_for_unknown_user_rejected(client):
    import uuid

    token = create_token(uuid.uuid4(), "state_admin", "access")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
