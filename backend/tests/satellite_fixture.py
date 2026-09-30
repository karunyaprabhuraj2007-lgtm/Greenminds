"""Sentinel-2 test fixture.

The STAC responses in tests/fixtures/earth_search_s2_page*.json follow the Earth
Search v1 item format (assets red/nir/scl with raster:bands scale 0.0001 and
offset -0.1, next-link pagination). They were written by hand for this test,
because the live API cannot be reached from the CI sandbox. Asset hrefs point to
small GeoTIFFs generated here in UTM 43N:

- S2A_..._20260610: clear. Red DN 1500, NIR DN 4000 -> reflectance 0.05 / 0.30
  -> NDVI 0.7143. Inside plot P-001 NIR DN 2000 -> 0.10 -> NDVI 0.3333.
- S2A_..._20260720: west half of the AOI under cloud (SCL 9); east half clear.
- S2B_..._20260825: fully cloudy (SCL 9) -> no NDVI.
- S2A_..._20260601: has no assets -> ignored.
"""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import shape
from shapely.ops import transform as shp_transform

FIXTURES = Path(__file__).parent / "fixtures"
CRS = "EPSG:32643"


def write_scene_rasters(folder: Path, aoi_geojson: dict, plot_geojson: dict) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    to_utm = Transformer.from_crs("EPSG:4326", CRS, always_xy=True).transform
    aoi = shp_transform(to_utm, shape(aoi_geojson))
    plot = shp_transform(to_utm, shape(plot_geojson))
    minx, miny, maxx, maxy = aoi.bounds
    x0, y1 = np.floor(minx / 20) * 20 - 200, np.ceil(maxy / 20) * 20 + 200
    w10 = int((np.ceil(maxx / 20) * 20 + 200 - x0) / 10)
    h10 = int((y1 - (np.floor(miny / 20) * 20 - 200)) / 10)
    t10, t20 = from_origin(x0, y1, 10, 10), from_origin(x0, y1, 20, 20)
    plot_mask = rasterize([plot], out_shape=(h10, w10), transform=t10).astype(bool)
    xs20 = x0 + (np.arange(w10 // 2) + 0.5) * 20
    mid_x = (minx + maxx) / 2

    def write(name, data, transform, dtype):
        with rasterio.open(folder / name, "w", driver="GTiff", width=data.shape[1], height=data.shape[0], count=1,
                           dtype=dtype, crs=CRS, transform=transform, nodata=0, tiled=True, blockxsize=256, blockysize=256) as ds:
            ds.write(data.astype(dtype), 1)

    red = np.full((h10, w10), 1500, "uint16")
    nir = np.full((h10, w10), 4000, "uint16")
    nir[plot_mask] = 2000
    for sid, scl in (
        ("S2A_43QDA_20260610_0_L2A", np.full((h10 // 2, w10 // 2), 4, "uint8")),
        ("S2A_43QDA_20260720_0_L2A", np.where(xs20[None, :] < mid_x, 9, 4).repeat(h10 // 2, axis=0).astype("uint8")),
        ("S2B_43QDA_20260825_0_L2A", np.full((h10 // 2, w10 // 2), 9, "uint8")),
    ):
        write(f"{sid}_B04.tif", red, t10, "uint16")
        write(f"{sid}_B08.tif", nir, t10, "uint16")
        write(f"{sid}_SCL.tif", scl, t20, "uint8")


def stac_transport(data_dir: Path, requests: list | None = None) -> httpx.MockTransport:
    pages = {name: (FIXTURES / name).read_text().replace("{DATA}", str(data_dir))
             for name in ("earth_search_s2_page1.json", "earth_search_s2_page2.json")}

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        if requests is not None:
            requests.append(body)
        page = "earth_search_s2_page2.json" if body.get("next") else "earth_search_s2_page1.json"
        return httpx.Response(200, text=pages[page], headers={"content-type": "application/geo+json"})

    return httpx.MockTransport(handler)
