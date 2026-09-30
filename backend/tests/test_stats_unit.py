"""Known-answer tests for the 'current survey' rule (no DB)."""
import uuid
from datetime import date
from types import SimpleNamespace

from geoalchemy2.shape import from_shape
from shapely.geometry import box

from app.db.models import SurveyStatus
from app.services.plot_data import current_surveys


def _s(day, bounds, status=SurveyStatus.processed):
    return SimpleNamespace(id=uuid.uuid4(), survey_date=date(2026, 1, day), status=status,
                           aoi=from_shape(box(*bounds), srid=4326))


def test_later_overlapping_survey_supersedes_earlier():
    old, new = _s(1, (0, 0, 1, 1)), _s(5, (0.5, 0.5, 1.5, 1.5))
    assert current_surveys([old, new]) == [new]


def test_disjoint_surveys_are_both_current():
    a, b = _s(1, (0, 0, 1, 1)), _s(5, (2, 2, 3, 3))
    assert set(map(id, current_surveys([a, b]))) == {id(a), id(b)}


def test_unprocessed_surveys_do_not_count_or_supersede():
    old = _s(1, (0, 0, 1, 1))
    draft = _s(9, (0, 0, 1, 1), status=SurveyStatus.draft)
    assert current_surveys([old, draft]) == [old]
