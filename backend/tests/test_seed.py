from sqlalchemy import func, select

from app.db.models import Alert, District, Plot, PlotAIResult, Raster, Survey, User
from app.seed.seed_demo import SURVEYS, seed

SEEDED_NAMES = [name for name, *_ in SURVEYS]


def test_seed_is_idempotent(db):
    before = {m.__name__: db.scalar(select(func.count()).select_from(m)) for m in (District, Survey, Plot, PlotAIResult, Raster, Alert)}
    seed(db)
    after = {m.__name__: db.scalar(select(func.count()).select_from(m)) for m in (District, Survey, Plot, PlotAIResult, Raster, Alert)}
    assert before == after


def test_all_seeded_records_flagged_demo(db):
    surveys = db.scalars(select(Survey).where(Survey.name.in_(SEEDED_NAMES))).all()
    assert len(surveys) == 2 and all(s.is_demo for s in surveys)
    ids = [s.id for s in surveys]
    assert db.scalar(select(func.count()).select_from(Plot).where(Plot.survey_id.in_(ids), Plot.is_demo.is_(False))) == 0
    assert db.scalar(
        select(func.count()).select_from(PlotAIResult).where(PlotAIResult.survey_id.in_(ids), PlotAIResult.is_demo.is_(False))
    ) == 0
    rasters = db.scalars(select(Raster).where(Raster.survey_id.in_(ids))).all()
    assert len(rasters) == 2 and all(r.is_demo and not r.calibrated for r in rasters)
    alerts = db.scalars(select(Alert).where(Alert.survey_id.in_(ids))).all()
    assert alerts and all(a.is_demo for a in alerts)
    demo_users = db.scalars(select(User).where(User.email.like("%@greenminds.demo"))).all()
    assert len(demo_users) == 4 and all(u.is_demo for u in demo_users)


def test_two_dated_surveys_share_plot_codes(db):
    surveys = db.scalars(select(Survey).where(Survey.name.in_(SEEDED_NAMES)).order_by(Survey.survey_date)).all()
    assert len(surveys) == 2 and surveys[0].survey_date < surveys[1].survey_date
    codes = [
        set(db.scalars(select(Plot.plot_code).where(Plot.survey_id == s.id)).all()) for s in surveys
    ]
    assert codes[0] == codes[1] and len(codes[0]) == 12


def test_seeded_plot_area_matches_geometry(db):
    plot = db.scalar(select(Plot).where(Plot.plot_code == "MLG-001"))
    # 150 m x 130 m plot
    assert plot.area_ha == 1.95
