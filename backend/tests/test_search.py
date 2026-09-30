import pytest

from app.api.search import parse_coordinates
from tests.conftest import ADMIN, OFFICER, auth_header


@pytest.mark.parametrize(
    "text,expected",
    [
        ("18.13, 74.52", (18.13, 74.52)),
        ("18.13 74.52", (18.13, 74.52)),
        ("-33.9,18.4", (-33.9, 18.4)),
        ("95, 74", None),  # latitude out of range
        ("Baramati", None),
    ],
)
def test_parse_coordinates(text, expected):
    assert parse_coordinates(text) == expected


def _search(client, tokens, q, email=ADMIN):
    res = client.get("/api/search", params={"q": q}, headers=auth_header(tokens, email))
    assert res.status_code == 200
    return res.json()["results"]


def test_search_coordinates(client, tokens):
    r = _search(client, tokens, "18.127, 74.522")
    assert r[0]["type"] == "coordinate" and r[0]["point"] == [74.522, 18.127]


def test_search_admin_units(client, tokens):
    assert ("taluka", "Baramati") in {(r["type"], r["label"]) for r in _search(client, tokens, "bara")}
    assert any(r["type"] == "village" for r in _search(client, tokens, "Malegaon"))


def test_search_scopes_units_for_officer(client, tokens):
    assert _search(client, tokens, "Nashik", OFFICER) == []
    assert any(r["label"] == "Nashik" for r in _search(client, tokens, "Nashik", ADMIN))


def test_search_plot_code_crop_date_and_id(client, tokens):
    plots = _search(client, tokens, "MLG-007")
    assert len(plots) == 2 and all(r["type"] == "plot" for r in plots)  # one per dated survey
    crops = _search(client, tokens, "sugar")
    assert crops and all(r["type"] == "crop" and r["crop"] == "sugarcane" for r in crops)
    dated = _search(client, tokens, "2026-08-20")
    assert len(dated) == 1 and dated[0]["type"] == "survey"
    assert _search(client, tokens, dated[0]["id"])[0]["id"] == dated[0]["id"]
    assert _search(client, tokens, "2026-02-30") == []


def test_search_requires_query(client, tokens):
    assert client.get("/api/search", headers=auth_header(tokens, ADMIN)).status_code == 422
