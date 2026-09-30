"""Known-answer tests for the synthetic NDVI COG writer."""
import numpy as np
import pytest
import rasterio
from pyproj import Transformer
from shapely.geometry import Polygon

from app.services.geo import offset_lonlat
from app.services.sample_data import NODATA, PlotNdvi, utm_crs_for, write_ndvi_cog


@pytest.mark.parametrize(
    "lon,lat,epsg",
    [(74.52, 18.12, 32643), (72.8, 19.0, 32643), (71.99, 19.0, 32642), (-0.1, 51.5, 32630), (15.0, -10.0, 32733)],
)
def test_utm_zone(lon, lat, epsg):
    assert utm_crs_for(lon, lat).to_epsg() == epsg


def _square(e0, n0, side):
    pts = [(e0, n0), (e0 + side, n0), (e0 + side, n0 + side), (e0, n0 + side)]
    return Polygon([offset_lonlat(74.52, 18.125, e, n) for e, n in pts])


def test_ndvi_cog_values(tmp_path):
    aoi = _square(0, 0, 200)
    plot = PlotNdvi(_square(50, 50, 100), ndvi_mean=0.7, ndvi_p10=0.6, ndvi_p90=0.8)
    stats = write_ndvi_cog(tmp_path / "ndvi.tif", aoi, [plot], resolution_m=1.0, seed=1)
    assert stats["crs"] == "EPSG:32643"
    with rasterio.open(tmp_path / "ndvi.tif") as ds:
        assert ds.nodata == NODATA and ds.count == 1 and ds.dtypes[0] == "float32"
        assert ds.tags()["DEMO_DATA"] == "true"
        data = ds.read(1)
        to_utm = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True).transform
        # Around the plot centre: mean/p10/p90 match the plot statistics.
        r, c = ds.index(*to_utm(*plot.geom.centroid.coords[0]))
        inside = data[r - 20 : r + 20, c - 20 : c + 20]
        assert inside.mean() == pytest.approx(0.7, abs=0.03)
        assert np.percentile(inside, 10) == pytest.approx(0.6, abs=0.04)
        assert np.percentile(inside, 90) == pytest.approx(0.8, abs=0.04)
        # Bare soil between plots ~ 0.12.
        r, c = ds.index(*to_utm(*offset_lonlat(74.52, 18.125, 20, 20)))
        assert data[r - 5 : r + 5, c - 5 : c + 5].mean() == pytest.approx(0.12, abs=0.02)
    # 200 m x 200 m at 1 m resolution -> about 40,000 valid pixels.
    assert stats["valid_pixels"] == pytest.approx(40_000, rel=0.02)


def test_large_cog_has_overviews(tmp_path):
    write_ndvi_cog(tmp_path / "big.tif", _square(0, 0, 600), [], resolution_m=0.5)
    with rasterio.open(tmp_path / "big.tif") as ds:
        assert ds.overviews(1), "COG must carry overviews"


def test_pixels_outside_aoi_are_nodata(tmp_path):
    # Triangle AOI: its bounding box has a corner outside the AOI.
    aoi = Polygon([offset_lonlat(74.52, 18.125, e, n) for e, n in [(0, 0), (100, 0), (0, 100)]])
    write_ndvi_cog(tmp_path / "t.tif", aoi, [], resolution_m=1.0)
    with rasterio.open(tmp_path / "t.tif") as ds:
        data = ds.read(1)
        assert data[0, -1] == NODATA  # north-east corner is outside the triangle
        assert (data != NODATA).sum() == pytest.approx(5_000, rel=0.03)
