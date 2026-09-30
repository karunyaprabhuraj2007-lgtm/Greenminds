import pytest

from app.api.search import parse_coordinates
from tests.conftest import ADMIN, OFFICER, auth_header


@pytest.mark.parametrize(
    "text,expected",
    [
        ("18.13, 74.52", (18.13, 74.52)),
        ("18.13 74.52", (18.13, 74.52)),
        ("-33.9,18.4", (-33.9, 18.4)),
        ("95, 74", None),
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
    r = _search(client, tokens, "18.2194, 74.4521")
    assert r[0]["type"] == "coordinate" and r[0]["point"] == [74.4521, 18.2194]


def test_search_real_admin_units(client, tokens):
    assert ("taluka", "Baramati") in {(r["type"], r["label"]) for r in _search(client, tokens, "barama")}
    assert any(r["type"] == "district" and r["label"] == "Pune" for r in _search(client, tokens, "Pune"))


def test_search_scopes_units_for_officer(client, tokens):
    assert not any(r["label"] == "Nashik" for r in _search(client, tokens, "Nashik", OFFICER))
    assert any(r["label"] == "Nashik" for r in _search(client, tokens, "Nashik", ADMIN))


def test_search_plots_surveys_dates_ids(client, tokens, world):
    plots = _search(client, tokens, "P-003")
    assert len(plots) == 2 and all(r["type"] == "plot" for r in plots)  # one per dated survey
    dated = _search(client, tokens, "2026-08-20")
    assert [r["id"] for r in dated] == [world["new"]["id"]]
    assert _search(client, tokens, world["new"]["id"])[0]["id"] == world["new"]["id"]
    assert any(r["type"] == "survey" for r in _search(client, tokens, "Baramati field"))
    assert _search(client, tokens, "2026-02-30") == []
    assert _search(client, tokens, "sugarcane") == []  # no AI crop results exist


def test_search_requires_query(client, tokens):
    assert client.get("/api/search", headers=auth_header(tokens, ADMIN)).status_code == 422
