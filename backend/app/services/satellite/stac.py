"""Minimal STAC API client for Sentinel-2 L2A scene search (Earth Search v1)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx


@dataclass
class Asset:
    href: str
    scale: float = 1.0
    offset: float = 0.0
    nodata: float | None = None


@dataclass
class Scene:
    id: str
    datetime: datetime
    platform: str | None
    cloud_cover: float | None
    assets: dict[str, Asset] = field(default_factory=dict)

    @property
    def date(self):
        return self.datetime.date()


class StacError(RuntimeError):
    pass


def _asset(raw: dict[str, Any]) -> Asset:
    bands = raw.get("raster:bands") or [{}]
    band = bands[0] if bands else {}
    return Asset(
        href=raw["href"],
        scale=float(band.get("scale", 1.0)),
        offset=float(band.get("offset", 0.0)),
        nodata=band.get("nodata"),
    )


def parse_item(item: dict[str, Any], asset_keys: dict[str, str]) -> Scene | None:
    """Scene from a STAC item, or None if a required asset is missing."""
    props = item.get("properties", {})
    assets = {}
    for role, key in asset_keys.items():
        raw = item.get("assets", {}).get(key)
        if raw is None or "href" not in raw:
            return None
        assets[role] = _asset(raw)
    when = datetime.fromisoformat(props["datetime"].replace("Z", "+00:00"))
    return Scene(
        id=item["id"],
        datetime=when,
        platform=props.get("platform"),
        cloud_cover=props.get("eo:cloud_cover"),
        assets=assets,
    )


def search_scenes(
    client: httpx.Client,
    stac_url: str,
    collection: str,
    aoi: dict[str, Any],
    start: datetime,
    end: datetime,
    asset_keys: dict[str, str],
    max_cloud: float | None = None,
    max_items: int = 400,
) -> list[Scene]:
    """All scenes intersecting `aoi` (GeoJSON geometry) in [start, end], oldest first."""
    body: dict[str, Any] = {
        "collections": [collection],
        "intersects": aoi,
        "datetime": f"{start.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end.strftime('%Y-%m-%dT%H:%M:%SZ')}",
        "limit": 100,
    }
    if max_cloud is not None:
        body["query"] = {"eo:cloud_cover": {"lte": max_cloud}}
    url: str | None = f"{stac_url.rstrip('/')}/search"
    scenes: list[Scene] = []
    seen: set[str] = set()
    method, payload = "POST", body
    while url and len(scenes) < max_items:
        try:
            res = client.request(method, url, json=payload if method == "POST" else None, timeout=60)
        except httpx.HTTPError as exc:
            raise StacError(f"STAC request failed: {type(exc).__name__}: {exc}") from exc
        if res.status_code >= 400:
            raise StacError(f"STAC search returned HTTP {res.status_code}: {res.text[:200]}")
        data = res.json()
        for item in data.get("features", []):
            scene = parse_item(item, asset_keys)
            if scene and scene.id not in seen:
                seen.add(scene.id)
                scenes.append(scene)
        nxt = next((link for link in data.get("links", []) if link.get("rel") == "next"), None)
        if not nxt:
            break
        url = nxt["href"]
        method = nxt.get("method", "GET").upper()
        payload = {**body, **nxt.get("body", {})} if method == "POST" and nxt.get("merge") else nxt.get("body", body)
    return sorted(scenes, key=lambda s: s.datetime)
