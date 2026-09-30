from tests.conftest import ADMIN, OFFICER, OPERATOR, VERIFIER, auth_header


def test_admin_reads_audit_log(client, tokens):
    res = client.get("/api/audit-log?action=login", headers=auth_header(tokens, ADMIN))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 4
    assert all(item["action"] == "login" for item in body["items"])


def test_audit_log_filter_by_entity(client, tokens):
    res = client.get("/api/audit-log?entity=user&page_size=5", headers=auth_header(tokens, ADMIN))
    assert res.status_code == 200
    assert len(res.json()["items"]) <= 5


def test_audit_log_admin_only(client, tokens):
    for email in (OFFICER, OPERATOR, VERIFIER):
        assert client.get("/api/audit-log", headers=auth_header(tokens, email)).status_code == 403
