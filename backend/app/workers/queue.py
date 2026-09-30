"""RQ queue wiring. Processing jobs are added in Phase 5."""
from __future__ import annotations

from redis import Redis
from rq import Queue

from app.core.config import get_settings

QUEUE_NAME = "greenminds"


def get_queue() -> Queue:
    return Queue(QUEUE_NAME, connection=Redis.from_url(get_settings().redis_url))
