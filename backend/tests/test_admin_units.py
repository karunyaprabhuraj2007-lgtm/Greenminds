from tests.conftest import ADMIN, OFFICER, VERIFIER, auth_header


def test_admin_sees_all_districts(client, tokens):
    res = client.get("/api/admin-units/districts", headers=auth_header(tokens, ADMIN))
    assert res.status_code == 200
    names = [d["name"] for d in res.json()["items"]]
    assert names == ["Nashik", "Pune"]
    assert all(d["is_demo"] for d in res.json()["items"])
    assert all(d["geometry"] is None for d in res.json()["items"])


def test_district_officer_sees_only_own_district(client, tokens):
    h = auth_header(tokens, OFFICER)
    names = [d["name"] for d in client.get("/api/admin-units/districts", headers=h).json()["items"]]
    assert names == ["Pune"]
    talukas = [t["name"] for t in client.get("/api/admin-units/talukas", headers=h).json()["items"]]
    assert sorted(talukas) == ["Baramati", "Indapur"]
    villages = [v["name"] for v in client.get("/api/admin-units/villages", headers=h).json()["items"]]
    assert "Pimpalgaon (demo)" not in villages and "Malegaon Bk (demo)" in villages


def test_talukas_filtered_by_district_with_geometry(client, tokens):
    h = auth_header(tokens, ADMIN)
    districts = client.get("/api/admin-units/districts", headers=h).json()["items"]
    nashik = next(d for d in districts if d["name"] == "Nashik")
    res = client.get(f"/api/admin-units/talukas?district_id={nashik['id']}&geometry=true", headers=h)
    items = res.json()["items"]
    assert [t["name"] for t in items] == ["Niphad"]
    assert items[0]["parent_id"] == nashik["id"]
    assert items[0]["geometry"]["type"] == "MultiPolygon"
    min_lon, min_lat, max_lon, max_lat = items[0]["bbox"]
    assert min_lon < max_lon and min_lat < max_lat


def test_villages_filtered_by_taluka(client, tokens):
    h = auth_header(tokens, ADMIN)
    talukas = client.get("/api/admin-units/talukas", headers=h).json()["items"]
    baramati = next(t for t in talukas if t["name"] == "Baramati")
    res = client.get(f"/api/admin-units/villages?taluka_id={baramati['id']}", headers=h)
    assert [v["name"] for v in res.json()["items"]] == ["Malegaon Bk (demo)"]


def test_admin_units_require_auth(client, tokens):
    assert client.get("/api/admin-units/districts").status_code == 401
    # Any authenticated role can read the unit list.
    assert client.get("/api/admin-units/districts", headers=auth_header(tokens, VERIFIER)).status_code == 200


def test_pagination(client, tokens):
    res = client.get("/api/admin-units/districts?page=2&page_size=1", headers=auth_header(tokens, ADMIN))
    body = res.json()
    assert body["total"] == 2 and body["page"] == 2 and body["page_size"] == 1
    assert [d["name"] for d in body["items"]] == ["Pune"]
