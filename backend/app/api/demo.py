"""Demo helpers: the default demo AOI (the real field polygon in inputs/)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from shapely.geometry import mapping

from app.core.config import get_settings
from app.core.deps import require_capability
from app.core.permissions import Capability
from app.db.models import User
from app.services.aoi_io import SUPPORTED_SUFFIXES, AoiError, find_default_aoi, read_aoi_file
from app.services.geo import geodesic_area_ha

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/default-aoi")
def default_aoi(_: User = Depends(require_capability(Capability.create_survey))) -> dict[str, Any]:
    found = find_default_aoi(get_settings().inputs_dir)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No field polygon found in the inputs folder")
    path, poly = found
    return {
        "source": path.name,
        "geometry": mapping(poly),
        "area_ha": round(geodesic_area_ha(poly), 3),
        "bbox": list(poly.bounds),
    }


@router.get("/aois")
def input_aois(_: User = Depends(require_capability(Capability.create_survey))) -> list[dict[str, Any]]:
    """Every readable field polygon in the inputs folder (real AOIs supplied by the user)."""
    folder = get_settings().inputs_dir
    out: list[dict[str, Any]] = []
    if not folder.is_dir():
        return out
    for path in sorted(folder.iterdir()):
        if not (path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES):
            continue
        try:
            poly = read_aoi_file(path)
        except (AoiError, OSError, KeyError, TypeError, ValueError) as exc:
            out.append({"source": path.name, "error": str(exc)})
            continue
        out.append({"source": path.name, "geometry": mapping(poly), "area_ha": round(geodesic_area_ha(poly), 3),
                    "bbox": list(poly.bounds)})
    return out
