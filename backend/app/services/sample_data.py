"""Synthetic sample rasters for the demo survey.

These are NOT processed imagery: they rasterize the seeded (synthetic) plot
NDVI values so the map, tile server and legends can be demonstrated before a
real flight is processed. Every raster made here is registered with
`is_demo=True` and `calibrated=False`.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import Polygon
from shapely.ops import transform as shp_transform

NODATA = -9999.0
SOIL_NDVI = 0.12  # bunds / bare soil between plots


@dataclass
class PlotNdvi:
    geom: Polygon  # lon/lat
    ndvi_mean: float
    ndvi_p10: float
    ndvi_p90: float


def utm_crs_for(lon: float, lat: float) -> CRS:
    """UTM zone CRS (WGS84) containing the given lon/lat."""
    zone = int((lon + 180) // 6) + 1
    return CRS.from_epsg((32600 if lat >= 0 else 32700) + zone)


def write_ndvi_cog(
    path: Path,
    aoi: Polygon,
    plots: list[PlotNdvi],
    resolution_m: float = 0.5,
    seed: int = 0,
) -> dict:
    """Write a float32 NDVI Cloud-Optimized GeoTIFF (UTM) covering `aoi`.

    Pixels inside a plot get values spread between the plot's p10 and p90
    around its mean; pixels in the AOI outside plots get a bare-soil value;
    pixels outside the AOI are nodata. Returns summary stats of valid pixels.
    """
    centroid = aoi.centroid
    crs = utm_crs_for(centroid.x, centroid.y)
    to_utm = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform
    aoi_utm = shp_transform(to_utm, aoi)
    minx, miny, maxx, maxy = aoi_utm.bounds
    width = int(np.ceil((maxx - minx) / resolution_m))
    height = int(np.ceil((maxy - miny) / resolution_m))
    transform = from_origin(minx, maxy, resolution_m, resolution_m)

    rng = np.random.default_rng(seed)
    data = np.full((height, width), SOIL_NDVI, dtype=np.float32)
    data += rng.normal(0, 0.02, size=data.shape).astype(np.float32)

    prng = random.Random(seed)
    for plot in plots:
        mask = rasterize([shp_transform(to_utm, plot.geom)], out_shape=data.shape, transform=transform) == 1
        n = int(mask.sum())
        if n == 0:
            continue
        # Normal distribution whose 10th/90th percentiles match p10/p90
        # (z = 1.2816), clipped to that range's extremes.
        sigma = max((plot.ndvi_p90 - plot.ndvi_p10) / (2 * 1.2816), 1e-3)
        values = rng.normal(plot.ndvi_mean, sigma, size=n)
        # Mild in-field gradient so the tiles do not look like flat blocks.
        yy, xx = np.nonzero(mask)
        angle = prng.uniform(0, np.pi)
        grad = (np.cos(angle) * (xx - xx.mean()) + np.sin(angle) * (yy - yy.mean())) / max(mask.shape)
        values = values + grad * 0.05
        data[mask] = np.clip(values, -1.0, 1.0).astype(np.float32)

    aoi_mask = rasterize([aoi_utm], out_shape=data.shape, transform=transform) == 1
    data[~aoi_mask] = NODATA

    path.parent.mkdir(parents=True, exist_ok=True)
    profile = {
        "driver": "COG",
        "dtype": "float32",
        "count": 1,
        "width": width,
        "height": height,
        "crs": crs,
        "transform": transform,
        "nodata": NODATA,
        "compress": "DEFLATE",
        "predictor": 3,
        "blocksize": 512,
    }
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data, 1)
        dst.set_band_description(1, "NDVI (synthetic demo)")
        dst.update_tags(DEMO_DATA="true", SOURCE="GreenMinds synthetic sample, not processed imagery")

    valid = data[aoi_mask]
    return {
        "min": round(float(valid.min()), 4),
        "max": round(float(valid.max()), 4),
        "mean": round(float(valid.mean()), 4),
        "p10": round(float(np.percentile(valid, 10)), 4),
        "p90": round(float(np.percentile(valid, 90)), 4),
        "valid_pixels": int(valid.size),
        "resolution_m": resolution_m,
        "crs": crs.to_string(),
    }
