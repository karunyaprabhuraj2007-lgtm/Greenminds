from tests.conftest import ADMIN, OFFICER, VERIFIER, auth_header


def test_admin_sees_all_real_districts(client, tokens):
    res = client.get("/api/admin-units/districts?page_size=100", headers=auth_header(tokens, ADMIN))
    assert res.status_code == 200
    body = res.json()
    names = [d["name"] for d in body["items"]]
    assert body["total"] == 36 and "Pune" in names and "Nashik" in names
    assert names == sorted(names)
    assert not any(d["is_demo"] for d in body["items"])
    assert all(d["geometry"] is None for d in body["items"])


def test_district_officer_sees_only_own_district(client, tokens):
    h = auth_header(tokens, OFFICER)
    names = [d["name"] for d in client.get("/api/admin-units/districts", headers=h).json()["items"]]
    assert names == ["Pune"]
    talukas = [t["name"] for t in client.get("/api/admin-units/talukas?page_size=100", headers=h).json()["items"]]
    assert "Baramati" in talukas and "Indapur" in talukas and "Niphad" not in talukas


def test_talukas_filtered_by_district_with_geometry(client, tokens):
    h = auth_header(tokens, ADMIN)
    districts = client.get("/api/admin-units/districts?page_size=100", headers=h).json()["items"]
    nashik = next(d for d in districts if d["name"] == "Nashik")
    res = client.get(f"/api/admin-units/talukas?district_id={nashik['id']}&geometry=true&page_size=100", headers=h)
    items = res.json()["items"]
    assert "Niphad" in [t["name"] for t in items]
    assert all(t["parent_id"] == nashik["id"] for t in items)
    assert items[0]["geometry"]["type"] == "MultiPolygon"
    min_lon, min_lat, max_lon, max_lat = items[0]["bbox"]
    assert 72 < min_lon < max_lon < 81 and 15 < min_lat < max_lat < 23  # inside Maharashtra


def test_no_village_boundaries_loaded(client, tokens):
    # No open village boundary source is bundled: the list is honestly empty.
    assert client.get("/api/admin-units/villages", headers=auth_header(tokens, ADMIN)).json()["total"] == 0


def test_admin_units_require_auth(client, tokens):
    assert client.get("/api/admin-units/districts").status_code == 401
    assert client.get("/api/admin-units/districts", headers=auth_header(tokens, VERIFIER)).status_code == 200


def test_pagination(client, tokens):
    body = client.get("/api/admin-units/districts?page=2&page_size=10", headers=auth_header(tokens, ADMIN)).json()
    assert body["total"] == 36 and body["page"] == 2 and len(body["items"]) == 10
