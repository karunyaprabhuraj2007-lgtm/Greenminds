"""Functions executed by the RQ worker."""
from __future__ import annotations

from app.services.jobs import run_job

__all__ = ["run_job", "ping"]


def ping() -> str:
    """Smoke-test job used to confirm the worker is alive."""
    return "pong"
