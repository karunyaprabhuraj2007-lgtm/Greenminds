"""Map configuration for the web client (basemaps, crop order, raster styles)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings, load_yaml_config
from app.core.deps import get_current_user
from app.db.models import Dataset, User
from app.db.session import get_db

router = APIRouter(prefix="/api/map", tags=["map"])


def _boundary_attribution(datasets: list[Dataset]) -> str | None:
    drawn = [d for d in datasets if d.key.endswith(("adm2", "adm3"))]
    if not drawn:
        return None
    ids = ", ".join(d.details.get("boundary_id", d.key) if d.details else d.key for d in drawn)
    licences = sorted({d.licence for d in drawn})
    source = drawn[0].original_source or ""
    return f"Boundaries: geoBoundaries ({ids}; {source}), {' / '.join(licences)}"


@router.get("/config")
def map_config(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> dict[str, Any]:
    settings = get_settings()
    cfg = load_yaml_config("map")
    datasets = db.scalars(select(Dataset).where(Dataset.key.like("geoboundaries-%")).order_by(Dataset.key)).all()
    sat = load_yaml_config("satellite")
    return {
        "basemap": {"tiles_url": settings.basemap_tiles_url, "attribution": settings.basemap_attribution},
        "basemaps": {
            "light": {"tiles_url": settings.basemap_tiles_url, "attribution": settings.basemap_attribution},
            "dark": {"tiles_url": settings.basemap_dark_tiles_url, "attribution": settings.basemap_dark_attribution},
        },
        "boundaries": {
            # The map draws districts (ADM2) and talukas (ADM3); ADM1 is only used to select Maharashtra.
            "attribution": _boundary_attribution(datasets),
            "datasets": [
                {"key": d.key, "name": d.name, "provider": d.provider, "original_source": d.original_source,
                 "licence": d.licence, "url": d.url, "version": d.version, "attribution": d.attribution}
                for d in datasets
            ],
        },
        "satellite_source": {"name": "Sentinel-2 L2A", "attribution": sat["attribution"], "licence": sat["licence"],
                             "stac_url": sat["stac_url"]},
        "satellite": {"tiles_url": settings.satellite_tiles_url or None, "attribution": settings.satellite_attribution},
        "tile_server_url": settings.tile_server_url,
        "crops": cfg.get("crops", []),
        "raster_styles": cfg.get("raster_styles", {}),
        "initial_view": cfg.get("initial_view", {"center": [75.7, 19.0], "zoom": 6}),
        "health_thresholds": load_yaml_config("thresholds").get("health", {}),
    }
