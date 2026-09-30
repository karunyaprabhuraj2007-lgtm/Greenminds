"""COG tile service (rio-tiler) with the TiTiler URL shape:

    /api/tiles/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=<cog>&rescale=a,b&colormap_name=<cmap>

Only COGs registered in `rasters` for a survey the caller can see may be read,
so the `url` parameter cannot be used to read arbitrary files or URLs.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from rio_tiler.colormap import cmap
from rio_tiler.errors import TileOutsideBounds
from rio_tiler.io import Reader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import Raster, User
from app.db.session import get_db
from app.services.scope import visible_survey_ids

router = APIRouter(prefix="/api/tiles", tags=["tiles"])

TILE_MATRIX_SET = "WebMercatorQuad"


def _parse_rescale(rescale: str | None) -> list[tuple[float, float]] | None:
    if not rescale:
        return None
    try:
        lo, hi = (float(v) for v in rescale.split(","))
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "rescale must be 'min,max'") from None
    return [(lo, hi)]


@router.get(
    "/cog/tiles/{tms}/{z}/{x}/{y}.png",
    responses={200: {"content": {"image/png": {}}}, 204: {"description": "Tile outside raster bounds"}},
    response_class=Response,
)
def cog_tile(
    tms: str,
    z: int,
    x: int,
    y: int,
    url: str = Query(..., description="COG location as registered in the rasters table"),
    rescale: str | None = Query(None, description="min,max"),
    colormap_name: str | None = Query(None),
    bidx: list[int] | None = Query(None, description="Band index(es), 1-based"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    if tms != TILE_MATRIX_SET:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Only {TILE_MATRIX_SET} is supported")
    raster = db.scalar(
        select(Raster).where(Raster.cog_url == url, Raster.survey_id.in_(visible_survey_ids(db, user)))
    )
    if raster is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Raster not found")
    if colormap_name is not None and colormap_name not in cmap.list():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown colormap_name")
    in_range = _parse_rescale(rescale)

    try:
        with Reader(url) as src:
            indexes = tuple(bidx) if bidx else (1 if src.dataset.count == 1 else (1, 2, 3))
            img = src.tile(x, y, z, indexes=indexes, tilesize=256)
    except TileOutsideBounds:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except (OSError, ValueError) as exc:  # unreadable / missing file
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Raster unreadable: {type(exc).__name__}") from None

    if in_range:
        img.rescale(in_range=in_range)
    colormap = cmap.get(colormap_name) if colormap_name else None
    content = img.render(img_format="PNG", colormap=colormap)
    return Response(content, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})
