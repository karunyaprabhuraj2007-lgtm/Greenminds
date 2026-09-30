import pytest

from app.db.models import HealthClass
from app.services.thresholds import classify_health, load_thresholds

T = {"health": {"ndvi_healthy_min": 0.6, "ndvi_moderate_min": 0.3}}


@pytest.mark.parametrize(
    "ndvi,expected",
    [
        (0.85, HealthClass.healthy),
        (0.61, HealthClass.healthy),
        (0.60, HealthClass.moderate),  # boundary: healthy is strictly > 0.6
        (0.45, HealthClass.moderate),
        (0.30, HealthClass.moderate),  # boundary: moderate is 0.3..0.6
        (0.29, HealthClass.severe),
        (-0.1, HealthClass.severe),
    ],
)
def test_classify_health(ndvi, expected):
    assert classify_health(ndvi, T) == expected


def test_thresholds_loaded_from_config():
    cfg = load_thresholds()
    assert cfg["health"]["ndvi_healthy_min"] == 0.6
    assert cfg["health"]["ndvi_moderate_min"] == 0.3
