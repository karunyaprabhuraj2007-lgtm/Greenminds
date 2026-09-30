"""Map configuration for the web client (basemaps, crop order, raster styles)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.core.config import get_settings, load_yaml_config
from app.core.deps import get_current_user
from app.db.models import User

router = APIRouter(prefix="/api/map", tags=["map"])


@router.get("/config")
def map_config(_: User = Depends(get_current_user)) -> dict[str, Any]:
    settings = get_settings()
    cfg = load_yaml_config("map")
    return {
        "basemap": {"tiles_url": settings.basemap_tiles_url, "attribution": settings.basemap_attribution},
        "satellite": {"tiles_url": settings.satellite_tiles_url or None, "attribution": settings.satellite_attribution},
        "tile_server_url": settings.tile_server_url,
        "crops": cfg.get("crops", []),
        "raster_styles": cfg.get("raster_styles", {}),
        "initial_view": cfg.get("initial_view", {"center": [75.7, 19.0], "zoom": 6}),
        "health_thresholds": load_yaml_config("thresholds").get("health", {}),
    }
