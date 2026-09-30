from sqlalchemy import func, select

from app.db.models import Alert, Dataset, District, Plot, PlotAIResult, Raster, Survey, Taluka, User, Village
from app.seed.seed import seed


def _counts(db):
    return {m.__name__: db.scalar(select(func.count()).select_from(m)) for m in (Dataset, District, Taluka, Village, User)}


def test_seed_is_idempotent(db):
    before = _counts(db)
    seed(db)
    assert _counts(db) == before


def test_real_boundaries_with_provenance(db):
    assert db.scalar(select(func.count()).select_from(District)) == 36
    assert db.scalar(select(func.count()).select_from(Taluka)) == 357
    pune = db.scalar(select(District).where(District.name == "Pune"))
    ds = db.get(Dataset, pune.dataset_id)
    assert ds.provider == "geoBoundaries (gbOpen)"
    assert "Open Database License" in ds.licence
    assert "geoBoundaries" in ds.attribution and ds.version
    assert pune.source_id and not pune.is_demo
    assert db.scalar(select(func.count()).select_from(District).where(District.is_demo.is_(True))) == 0


def test_seed_creates_no_survey_data(db):
    """The seed loads boundaries and demo accounts only: no invented surveys, plots, results or alerts."""
    fresh = db.scalar(select(func.count()).select_from(Survey).where(Survey.is_demo.is_(True)))
    assert fresh == 0
    for model in (Plot, PlotAIResult, Raster, Alert):
        assert db.scalar(select(func.count()).select_from(model).where(model.is_demo.is_(True))) == 0


def test_demo_accounts_only(db):
    demo_users = db.scalars(select(User).where(User.email.like("%@greenminds.demo"))).all()
    assert len(demo_users) == 4 and all(u.is_demo for u in demo_users)
    officer = next(u for u in demo_users if u.email.startswith("officer"))
    assert db.get(District, officer.district_id).name == "Pune"
