"""Application settings (env vars) and YAML config loading.

Nothing operational is hard-coded: URLs, secrets and profiles come from the
environment; camera / aircraft / threshold values come from `config/*.yaml`.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[3]
_REPO_CONFIG_DIR = _REPO_ROOT / "config"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "GreenMinds Crop Intelligence Platform"
    environment: str = "development"

    database_url: str = "postgresql+psycopg://greenminds:greenminds@localhost:5432/greenminds"

    jwt_secret: str = "change-me-in-env"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7

    cors_origins: str = "http://localhost:5173"

    redis_url: str = "redis://localhost:6379/0"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "greenminds"
    minio_secret_key: str = "greenminds-secret"
    minio_bucket: str = "greenminds"
    minio_secure: bool = False

    titiler_url: str = "http://localhost:8001"
    # Base of the tile service. "/api/tiles" = COG tiles rendered by this backend
    # (rio-tiler); point it at a TiTiler instance to use that instead. Both use
    # the TiTiler URL shape: {base}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=...
    tile_server_url: str = "/api/tiles"
    nodeodm_url: str = "http://localhost:3000"

    video_source_url: str = ""
    mediamtx_webrtc_url: str = "http://localhost:8889"
    mediamtx_hls_url: str = "http://localhost:8888"
    mediamtx_path: str = "drone"

    mavlink_url: str = "udp:0.0.0.0:14550"
    telemetry_mode: str = "replay"  # live | sitl | replay

    camera_profile: str = "survey3w_rgn"
    aircraft_profile: str = "agroscan_quad"

    config_dir: Path = _REPO_CONFIG_DIR
    # Folder with user-supplied inputs (e.g. the real field polygon used as the
    # default demo AOI). Compose mounts ./inputs at /inputs read-only.
    inputs_dir: Path = _REPO_ROOT / "inputs"
    # Local data directory (sample COGs etc.). Compose mounts a volume at /data.
    data_dir: Path = _REPO_ROOT / "data"

    # Map basemaps (any XYZ raster tile URL). Satellite context is optional.
    basemap_tiles_url: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    basemap_attribution: str = "© OpenStreetMap contributors"
    satellite_tiles_url: str = ""
    satellite_attribution: str = ""
    demo_mode: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def load_yaml_config(name: str) -> dict[str, Any]:
    """Load `config/<name>.yaml` from the configured config directory."""
    path = Path(get_settings().config_dir) / f"{name}.yaml"
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}
