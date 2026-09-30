"""Sentinel-2 NDVI time series for a survey AOI and its plots.

For every scene of the last `lookback_days` intersecting the AOI, store one
observation for the AOI (plot_id NULL) and one per plot: clear-pixel fraction
and NDVI mean / p10 / p90 (NULL when too few clear pixels). Scenes already
processed for a target are skipped (cache). The latest *clear* scene is also
written as an NDVI COG and registered as the survey's satellite NDVI layer.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from shapely.geometry import mapping
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings, load_yaml_config
from app.db.models import Plot, Raster, RasterKind, SatelliteObservation, Survey
from app.services.geo import to_shapely
from app.services.satellite.ndvi import compute_scene_ndvi, mask_for, stats_for, write_ndvi_cog
from app.services.satellite.stac import Scene, search_scenes

log = logging.getLogger(__name__)
SOURCE = "Sentinel-2 L2A"

# Tests replace this factory to serve recorded STAC responses.
http_client_factory: Callable[[], httpx.Client] = lambda: httpx.Client(follow_redirects=True)  # noqa: E731


def satellite_config() -> dict[str, Any]:
    return load_yaml_config("satellite")


def _existing(db: Session, survey_id: uuid.UUID) -> set[tuple[uuid.UUID | None, str]]:
    rows = db.execute(
        select(SatelliteObservation.plot_id, SatelliteObservation.scene_id).where(SatelliteObservation.survey_id == survey_id)
    ).all()
    return {(r[0], r[1]) for r in rows}


def refresh_survey(
    db: Session, survey: Survey, progress: Callable[[float, str], None] | None = None, now: datetime | None = None,
) -> dict[str, Any]:
    cfg = satellite_config()
    progress = progress or (lambda p, m: None)
    now = now or datetime.now(UTC)
    aoi = to_shapely(survey.aoi)
    plots = list(db.scalars(select(Plot).where(Plot.survey_id == survey.id)).all())
    plot_shapes = {p.id: to_shapely(p.geom) for p in plots}

    progress(0.05, f"Searching {cfg['collection']} scenes at {cfg['stac_url']}")
    with http_client_factory() as client:
        scenes = search_scenes(
            client, cfg["stac_url"], cfg["collection"], mapping(aoi),
            now - timedelta(days=cfg["lookback_days"]), now, cfg["assets"],
            max_cloud=cfg.get("max_scene_cloud_pct"), max_items=cfg.get("max_items", 400),
        )
    progress(0.1, f"{len(scenes)} scenes found")

    done = _existing(db, survey.id)
    targets: list[uuid.UUID | None] = [None, *plot_shapes.keys()]
    processed, failed, errors = 0, 0, []
    for i, scene in enumerate(scenes):
        missing = [t for t in targets if (t, scene.id) not in done]
        if not missing:
            continue
        try:
            sn = compute_scene_ndvi(scene.assets["red"], scene.assets["nir"], scene.assets["scl"], aoi, cfg["scl_clear_classes"])
        except Exception as exc:  # network / file errors: skip this scene, keep going
            failed += 1
            errors.append(f"{scene.id}: {type(exc).__name__}: {exc}"[:300])
            log.warning("scene %s failed: %s", scene.id, exc)
            continue
        for target in missing:
            mask = sn.aoi_mask if target is None else mask_for(plot_shapes[target], sn)
            st = stats_for(sn.ndvi, mask, cfg["min_valid_pixels"])
            db.add(SatelliteObservation(
                survey_id=survey.id, plot_id=target, collection=cfg["collection"], scene_id=scene.id,
                platform=scene.platform, scene_date=scene.date, acquired_at=scene.datetime,
                scene_cloud_pct=scene.cloud_cover, clear_fraction=round(st.clear_fraction, 4),
                valid_pixels=st.valid_pixels, total_pixels=st.total_pixels,
                ndvi_mean=st.mean, ndvi_p10=st.p10, ndvi_p90=st.p90,
            ))
        db.commit()
        processed += 1
        progress(0.1 + 0.8 * (i + 1) / max(len(scenes), 1), f"Processed {scene.id}")

    latest = _update_latest_layer(db, survey, scenes, cfg)
    progress(1.0, "Done")
    return {
        "scenes_found": len(scenes),
        "scenes_processed": processed,
        "scenes_failed": failed,
        "errors": errors[:10],
        "latest_clear_scene": latest,
    }


def _update_latest_layer(db: Session, survey: Survey, scenes: list[Scene], cfg: dict[str, Any]) -> dict[str, Any] | None:
    obs = db.scalar(
        select(SatelliteObservation)
        .where(
            SatelliteObservation.survey_id == survey.id,
            SatelliteObservation.plot_id.is_(None),
            SatelliteObservation.clear_fraction >= cfg["min_clear_fraction"],
            SatelliteObservation.ndvi_mean.is_not(None),
        )
        .order_by(SatelliteObservation.scene_date.desc(), SatelliteObservation.clear_fraction.desc())
    )
    if obs is None:
        return None
    summary = {"scene_id": obs.scene_id, "date": obs.scene_date.isoformat(), "clear_fraction": obs.clear_fraction}
    raster = db.scalar(
        select(Raster).where(Raster.survey_id == survey.id, Raster.kind == RasterKind.ndvi, Raster.source == SOURCE)
    )
    if raster is not None and raster.scene_id == obs.scene_id and raster.cog_url and Path(raster.cog_url).exists():
        return summary
    scene = next((s for s in scenes if s.id == obs.scene_id), None)
    if scene is None:
        return summary  # not in the current search window; keep the previous layer
    sn = compute_scene_ndvi(scene.assets["red"], scene.assets["nir"], scene.assets["scl"], to_shapely(survey.aoi), cfg["scl_clear_classes"])
    path = Path(get_settings().data_dir) / "satellite" / str(survey.id) / f"{scene.id}_ndvi.tif"
    write_ndvi_cog(path, sn, "NDVI (Sentinel-2 L2A, SCL cloud-masked)", {
        "SOURCE": SOURCE, "SCENE_ID": scene.id, "ACQUIRED": scene.datetime.isoformat(),
        "ATTRIBUTION": cfg["attribution"],
    })
    if raster is None:
        raster = Raster(survey_id=survey.id, kind=RasterKind.ndvi)
        db.add(raster)
    from geoalchemy2.shape import from_shape

    raster.cog_url = str(path)
    raster.crs = sn.crs.to_string()
    raster.gsd_cm = 1000.0
    raster.bounds = from_shape(to_shapely(survey.aoi).envelope, srid=4326)
    raster.stats_json = {"mean": obs.ndvi_mean, "p10": obs.ndvi_p10, "p90": obs.ndvi_p90, "clear_fraction": obs.clear_fraction}
    raster.is_demo = False
    raster.calibrated = True  # L2A surface reflectance
    raster.source = SOURCE
    raster.scene_id = scene.id
    raster.acquired_at = scene.datetime
    raster.cloud_cover = scene.cloud_cover
    raster.attribution = cfg["attribution"]
    db.commit()
    return summary
