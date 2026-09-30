"""Background job functions executed by the RQ worker."""
from __future__ import annotations


def ping() -> str:
    """Smoke-test job used to confirm the worker is alive."""
    return "pong"
