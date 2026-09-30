"""Cloud-masked NDVI from Sentinel-2 L2A bands for an AOI and its plots.

NDVI = (NIR - Red) / (NIR + Red), with NIR = B08 and Red = B04 converted to
surface reflectance using each asset's `raster:bands` scale and offset (L2A
processing baseline >= 04.00 adds a -0.1 offset). Pixels are kept only where the
scene classification layer (SCL, 20 m, resampled nearest to 10 m) is in the
configured clear classes and both bands have data.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.windows import Window, from_bounds
from rasterio.windows import bounds as window_bounds
from rasterio.windows import transform as window_transform
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shp_transform

from app.services.satellite.stac import Asset

NODATA = -9999.0
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF,.tiff",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "VSI_CACHE": "TRUE",
}


@dataclass
class NdviStats:
    total_pixels: int
    valid_pixels: int
    clear_fraction: float
    mean: float | None
    p10: float | None
    p90: float | None


@dataclass
class SceneNdvi:
    ndvi: np.ndarray            # float32, NaN where not valid
    transform: Affine
    crs: rasterio.crs.CRS
    aoi_mask: np.ndarray        # bool


def ndvi_from_reflectance(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """NDVI with NaN where undefined (sum <= 0)."""
    red = red.astype("float64")
    nir = nir.astype("float64")
    total = nir + red
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where(total > 0, (nir - red) / total, np.nan)
    return np.clip(out, -1.0, 1.0)


def stats_for(ndvi: np.ndarray, mask: np.ndarray, min_valid: int) -> NdviStats:
    """Statistics of `ndvi` inside `mask` (pixels where ndvi is NaN count as not clear)."""
    total = int(mask.sum())
    values = ndvi[mask & ~np.isnan(ndvi)]
    valid = int(values.size)
    frac = valid / total if total else 0.0
    if valid < max(1, min_valid):
        return NdviStats(total, valid, frac, None, None, None)
    return NdviStats(
        total, valid, frac,
        round(float(values.mean()), 4),
        round(float(np.percentile(values, 10)), 4),
        round(float(np.percentile(values, 90)), 4),
    )


def _read(asset: Asset, bounds: tuple[float, float, float, float], shape: tuple[int, int], resampling: Resampling) -> tuple[np.ndarray, np.ndarray]:
    """Read one band over `bounds` resampled to `shape`; returns (values, has_data)."""
    with rasterio.open(asset.href) as ds:
        win = from_bounds(*bounds, transform=ds.transform)
        data = ds.read(1, window=win, out_shape=shape, resampling=resampling, boundless=True, fill_value=0)
        nodata = asset.nodata if asset.nodata is not None else ds.nodata
    has_data = data != (nodata if nodata is not None else 0)
    return data, has_data


def compute_scene_ndvi(
    red: Asset, nir: Asset, scl: Asset, aoi: BaseGeometry, clear_classes: list[int],
) -> SceneNdvi:
    """Read the AOI window from the three assets and return masked NDVI on the 10 m grid."""
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(red.href) as ref:
            crs, ref_transform = ref.crs, ref.transform
            to_scene = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform
            aoi_scene = shp_transform(to_scene, aoi)
            minx, miny, maxx, maxy = aoi_scene.bounds
            # Snap the window to the 10 m pixel grid (plus one pixel margin).
            win = from_bounds(minx, miny, maxx, maxy, transform=ref_transform)
            win = Window(
                int(np.floor(win.col_off)) - 1, int(np.floor(win.row_off)) - 1,
                int(np.ceil(win.width)) + 2, int(np.ceil(win.height)) + 2,
            )
            transform = window_transform(win, ref_transform)
            bounds = window_bounds(win, ref_transform)
            shape = (int(win.height), int(win.width))
        red_dn, red_ok = _read(red, bounds, shape, Resampling.nearest)
        nir_dn, nir_ok = _read(nir, bounds, shape, Resampling.nearest)
        scl_v, _ = _read(scl, bounds, shape, Resampling.nearest)

    aoi_mask = rasterize([aoi_scene], out_shape=shape, transform=transform, all_touched=False).astype(bool)
    red_r = red_dn.astype("float64") * red.scale + red.offset
    nir_r = nir_dn.astype("float64") * nir.scale + nir.offset
    ndvi = ndvi_from_reflectance(red_r, nir_r)
    clear = np.isin(scl_v, clear_classes) & red_ok & nir_ok
    ndvi = np.where(clear & aoi_mask, ndvi, np.nan).astype("float32")
    return SceneNdvi(ndvi=ndvi, transform=transform, crs=crs, aoi_mask=aoi_mask)


def mask_for(geom: BaseGeometry, scene: SceneNdvi) -> np.ndarray:
    """Pixel mask of a lon/lat geometry on the scene window grid."""
    to_scene = Transformer.from_crs("EPSG:4326", scene.crs, always_xy=True).transform
    g = shp_transform(to_scene, geom)
    return rasterize([g], out_shape=scene.ndvi.shape, transform=scene.transform).astype(bool)


def write_ndvi_cog(path: Path, scene: SceneNdvi, description: str, tags: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.where(np.isnan(scene.ndvi), NODATA, scene.ndvi).astype("float32")
    profile = {
        "driver": "COG", "dtype": "float32", "count": 1,
        "width": data.shape[1], "height": data.shape[0],
        "crs": scene.crs, "transform": scene.transform, "nodata": NODATA,
        "compress": "DEFLATE", "predictor": 3, "blocksize": 256,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data, 1)
        dst.set_band_description(1, description)
        dst.update_tags(**tags)
