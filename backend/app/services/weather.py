"""Daily rainfall and temperature for a survey AOI centroid from Open-Meteo.

Days older than `archive_lag_days` come from the historical archive (ERA5-based
reanalysis); recent days and the forecast come from the forecast API. Archive
values win where both exist.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import load_yaml_config
from app.db.models import Survey, WeatherDaily
from app.services.geo import to_shapely

DAILY_VARS = "precipitation_sum,temperature_2m_max,temperature_2m_min"

http_client_factory: Callable[[], httpx.Client] = lambda: httpx.Client(follow_redirects=True)  # noqa: E731


class WeatherError(RuntimeError):
    pass


def weather_config() -> dict[str, Any]:
    return load_yaml_config("weather")


def parse_daily(payload: dict[str, Any]) -> list[dict[str, Any]]:
    daily = payload.get("daily") or {}
    days = daily.get("time") or []
    rain = daily.get("precipitation_sum") or [None] * len(days)
    tmax = daily.get("temperature_2m_max") or [None] * len(days)
    tmin = daily.get("temperature_2m_min") or [None] * len(days)
    return [
        {"day": date.fromisoformat(d), "precip_mm": rain[i], "tmax_c": tmax[i], "tmin_c": tmin[i]}
        for i, d in enumerate(days)
    ]


def _get(client: httpx.Client, url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        res = client.get(url, params=params, timeout=30)
    except httpx.HTTPError as exc:
        raise WeatherError(f"{url}: {type(exc).__name__}: {exc}") from exc
    if res.status_code >= 400:
        raise WeatherError(f"{url} returned HTTP {res.status_code}: {res.text[:200]}")
    return res.json()


def fetch_daily(lat: float, lon: float, today: date, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    start = today - timedelta(days=cfg["history_days"])
    archive_end = today - timedelta(days=cfg["archive_lag_days"])
    common = {"latitude": round(lat, 4), "longitude": round(lon, 4), "daily": DAILY_VARS, "timezone": cfg["timezone"]}
    with http_client_factory() as client:
        archive = parse_daily(_get(client, cfg["archive_url"], {
            **common, "start_date": start.isoformat(), "end_date": archive_end.isoformat()}))
        forecast = parse_daily(_get(client, cfg["forecast_url"], {
            **common, "past_days": cfg["archive_lag_days"] + 1, "forecast_days": cfg["forecast_days"]}))
    rows: dict[date, dict[str, Any]] = {}
    for r in forecast:
        rows[r["day"]] = {**r, "source": "forecast"}
    for r in archive:
        if r["precip_mm"] is not None or r["tmax_c"] is not None:
            rows[r["day"]] = {**r, "source": "archive"}
    return [rows[d] for d in sorted(rows) if d >= start]


def refresh_weather(db: Session, survey: Survey, progress: Callable[[float, str], None] | None = None) -> dict[str, Any]:
    cfg = weather_config()
    progress = progress or (lambda p, m: None)
    c = to_shapely(survey.aoi).centroid
    progress(0.1, f"Fetching Open-Meteo daily weather for {c.y:.4f}, {c.x:.4f}")
    rows = fetch_daily(c.y, c.x, datetime.now(UTC).date(), cfg)
    now = datetime.now(UTC)
    for r in rows:
        stmt = insert(WeatherDaily).values(survey_id=survey.id, fetched_at=now, **r)
        db.execute(stmt.on_conflict_do_update(
            constraint="uq_weather_daily_survey_day",
            set_={"precip_mm": stmt.excluded.precip_mm, "tmax_c": stmt.excluded.tmax_c,
                  "tmin_c": stmt.excluded.tmin_c, "source": stmt.excluded.source, "fetched_at": now},
        ))
    db.commit()
    progress(1.0, f"{len(rows)} days stored")
    return {"days": len(rows), "latitude": round(c.y, 4), "longitude": round(c.x, 4),
            "first_day": rows[0]["day"].isoformat() if rows else None,
            "last_day": rows[-1]["day"].isoformat() if rows else None}


def weather_rows(db: Session, survey_id, since: date) -> list[WeatherDaily]:
    return list(db.scalars(
        select(WeatherDaily).where(WeatherDaily.survey_id == survey_id, WeatherDaily.day >= since).order_by(WeatherDaily.day)
    ).all())
