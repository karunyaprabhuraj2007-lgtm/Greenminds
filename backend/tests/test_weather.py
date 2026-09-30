from datetime import UTC, date, datetime, timedelta

import httpx
import pytest

from app.services import weather
from tests.conftest import OFFICER, OPERATOR, VERIFIER, auth_header


def _payload(start: date, n: int, rain: float, tmax: float) -> dict:
    days = [(start + timedelta(days=i)).isoformat() for i in range(n)]
    return {"latitude": 18.22, "longitude": 74.45, "daily_units": {"precipitation_sum": "mm"},
            "daily": {"time": days, "precipitation_sum": [rain] * n,
                      "temperature_2m_max": [tmax] * n, "temperature_2m_min": [tmax - 10] * n}}


def fake_open_meteo(requests: list):
    today = datetime.now(UTC).date()

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if "archive" in request.url.host:
            start = date.fromisoformat(request.url.params["start_date"])
            end = date.fromisoformat(request.url.params["end_date"])
            return httpx.Response(200, json=_payload(start, (end - start).days + 1, 2.0, 30.0))
        past = int(request.url.params["past_days"])
        return httpx.Response(200, json=_payload(today - timedelta(days=past), past + 7, 5.0, 33.0))

    return httpx.MockTransport(handler)


def test_parse_daily():
    rows = weather.parse_daily(_payload(date(2026, 9, 1), 3, 1.5, 31.0))
    assert rows[0] == {"day": date(2026, 9, 1), "precip_mm": 1.5, "tmax_c": 31.0, "tmin_c": 21.0}
    assert weather.parse_daily({}) == []


def test_fetch_merges_archive_and_forecast(monkeypatch):
    requests: list = []
    monkeypatch.setattr(weather, "http_client_factory", lambda: httpx.Client(transport=fake_open_meteo(requests)))
    cfg = weather.weather_config()
    today = datetime.now(UTC).date()
    rows = weather.fetch_daily(18.22, 74.45, today, cfg)
    by_day = {r["day"]: r for r in rows}
    assert min(by_day) == today - timedelta(days=cfg["history_days"])
    assert max(by_day) == today + timedelta(days=cfg["forecast_days"] - 1)
    old = by_day[today - timedelta(days=30)]
    recent = by_day[today - timedelta(days=2)]
    assert (old["source"], old["precip_mm"]) == ("archive", 2.0)      # archive wins where it exists
    assert (recent["source"], recent["precip_mm"]) == ("forecast", 5.0)
    assert requests[0].url.params["daily"] == weather.DAILY_VARS
    assert requests[0].url.params["timezone"] == "Asia/Kolkata"


def test_weather_endpoints(client, tokens, world, monkeypatch):
    monkeypatch.setattr(weather, "http_client_factory", lambda: httpx.Client(transport=fake_open_meteo([])))
    sid = world["new"]["id"]
    empty = client.get(f"/api/surveys/{sid}/weather", headers=auth_header(tokens, OFFICER)).json()
    assert empty["days"] == [] and empty["totals"]["rain_mm_last_90d"] is None
    res = client.post(f"/api/surveys/{sid}/weather/refresh", headers=auth_header(tokens, OPERATOR))
    assert res.status_code == 200 and res.json()["job"]["status"] == "done"
    body = client.get(f"/api/surveys/{sid}/weather", headers=auth_header(tokens, OFFICER)).json()
    assert body["source"] == "Open-Meteo" and body["licence"] == "CC BY 4.0"
    assert len(body["days"]) >= 90
    assert body["totals"]["rain_mm_last_30d"] == pytest.approx(2.0 * 24 + 5.0 * 6, abs=10)
    again = client.post(f"/api/surveys/{sid}/weather/refresh", headers=auth_header(tokens, OPERATOR))
    assert again.json()["cached"] is True


def test_weather_failure_and_permissions(client, tokens, world, monkeypatch):
    blocked = httpx.MockTransport(lambda r: httpx.Response(403, text="Forbidden"))
    monkeypatch.setattr(weather, "http_client_factory", lambda: httpx.Client(transport=blocked))
    res = client.post(f"/api/surveys/{world['old']['id']}/weather/refresh", headers=auth_header(tokens, OPERATOR))
    assert res.json()["job"]["status"] == "failed" and "403" in res.json()["job"]["log"]
    assert client.post(f"/api/surveys/{world['old']['id']}/weather/refresh", headers=auth_header(tokens, VERIFIER)).status_code == 403
