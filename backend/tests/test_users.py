import uuid

from sqlalchemy import select

from app.db.models import AuditLog, District
from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header


def _email() -> str:
    return f"user-{uuid.uuid4().hex[:8]}@example.com"


def test_admin_lists_users(client, tokens):
    res = client.get("/api/users", headers=auth_header(tokens, ADMIN))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 4 and body["page"] == 1
    assert all("password_hash" not in u for u in body["items"])


def test_list_users_filter_by_role(client, tokens):
    res = client.get("/api/users?role=field_verifier", headers=auth_header(tokens, ADMIN))
    assert {u["role"] for u in res.json()["items"]} == {"field_verifier"}


def test_non_admins_cannot_manage_users(client, tokens):
    for email in (OFFICER, OPERATOR, VERIFIER):
        h = auth_header(tokens, email)
        assert client.get("/api/users", headers=h).status_code == 403
        res = client.post(
            "/api/users", headers=h,
            json={"name": "x", "email": _email(), "password": "password123", "role": "drone_operator"},
        )
        assert res.status_code == 403


def test_create_get_and_update_user_with_audit(client, tokens, db):
    h = auth_header(tokens, ADMIN)
    email = _email()
    res = client.post(
        "/api/users", headers=h,
        json={"name": "New Operator", "email": email, "password": "password123", "role": "drone_operator"},
    )
    assert res.status_code == 201, res.text
    user_id = res.json()["id"]
    assert client.get(f"/api/users/{user_id}", headers=h).json()["email"] == email

    res = client.patch(f"/api/users/{user_id}", headers=h, json={"name": "Renamed", "active": False})
    assert res.status_code == 200
    assert res.json()["name"] == "Renamed" and res.json()["active"] is False

    rows = db.scalars(select(AuditLog).where(AuditLog.entity_id == user_id).order_by(AuditLog.at)).all()
    assert [r.action for r in rows] == ["create", "update"]
    assert rows[1].before_json["name"] == "New Operator"
    assert rows[1].after_json["name"] == "Renamed"
    assert "password_hash" not in rows[0].after_json

    # Deactivated user cannot log in.
    res = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert res.status_code == 401


def test_password_change_allows_login(client, tokens):
    h = auth_header(tokens, ADMIN)
    email = _email()
    uid = client.post(
        "/api/users", headers=h,
        json={"name": "P", "email": email, "password": "password123", "role": "field_verifier"},
    ).json()["id"]
    assert client.patch(f"/api/users/{uid}", headers=h, json={"password": "newpassword456"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": email, "password": "newpassword456"}).status_code == 200


def test_duplicate_email_conflict(client, tokens):
    res = client.post(
        "/api/users", headers=auth_header(tokens, ADMIN),
        json={"name": "Dup", "email": OFFICER, "password": "password123", "role": "drone_operator"},
    )
    assert res.status_code == 409


def test_district_officer_requires_district(client, tokens, db):
    h = auth_header(tokens, ADMIN)
    body = {"name": "DO", "email": _email(), "password": "password123", "role": "district_officer"}
    assert client.post("/api/users", headers=h, json=body).status_code == 400
    pune = db.scalar(select(District).where(District.name == "Pune"))
    body["district_id"] = str(pune.id)
    assert client.post("/api/users", headers=h, json=body).status_code == 201


def test_unknown_district_rejected(client, tokens):
    res = client.post(
        "/api/users", headers=auth_header(tokens, ADMIN),
        json={"name": "X", "email": _email(), "password": "password123", "role": "drone_operator",
              "district_id": str(uuid.uuid4())},
    )
    assert res.status_code == 400


def test_admin_cannot_demote_or_deactivate_self(client, tokens):
    h = auth_header(tokens, ADMIN)
    me = client.get("/api/auth/me", headers=h).json()
    assert client.patch(f"/api/users/{me['id']}", headers=h, json={"active": False}).status_code == 400
    assert client.patch(f"/api/users/{me['id']}", headers=h, json={"role": "drone_operator"}).status_code == 400


def test_user_not_found(client, tokens):
    h = auth_header(tokens, ADMIN)
    assert client.get(f"/api/users/{uuid.uuid4()}", headers=h).status_code == 404
    assert client.patch(f"/api/users/{uuid.uuid4()}", headers=h, json={"name": "x"}).status_code == 404


def test_short_password_rejected(client, tokens):
    res = client.post(
        "/api/users", headers=auth_header(tokens, ADMIN),
        json={"name": "X", "email": _email(), "password": "short", "role": "drone_operator"},
    )
    assert res.status_code == 422
