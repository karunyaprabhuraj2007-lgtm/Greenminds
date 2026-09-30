"""Aggregate statistics for dashboards and survey summaries.

Basis: plots of the *current* surveys (the latest processed survey of each
area; older surveys are kept for history but not double-counted). Percentages
are area-weighted over analysed plots.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import Survey, SurveyStatus
from app.services.plot_data import (
    DONE_STATUSES,
    current_surveys,
    latest_ai_results,
    latest_verifications,
    plots_of,
    union_area_ha,
)

ACTIVE_STATUSES = (
    SurveyStatus.draft,
    SurveyStatus.planned,
    SurveyStatus.flying,
    SurveyStatus.uploaded,
    SurveyStatus.processing,
)


def _pct(part: float, whole: float) -> float | None:
    return round(100.0 * part / whole, 1) if whole > 0 else None


def aggregate(db: Session, surveys: list[Survey], *, current_only: bool = True) -> dict[str, Any]:
    basis = current_surveys(surveys) if current_only else [s for s in surveys if s.status in DONE_STATUSES]
    plots = plots_of(db, [s.id for s in basis])
    ids = [p.id for p in plots]
    ai = latest_ai_results(db, ids)
    ver = latest_verifications(db, ids)

    analysed = [p for p in plots if p.id in ai]
    analysed_ha = sum(p.area_ha or 0.0 for p in analysed)
    health_ha: dict[str, float] = defaultdict(float)
    health_n: dict[str, int] = defaultdict(int)
    crop_ha: dict[str, float] = defaultdict(float)
    crop_n: dict[str, int] = defaultdict(int)
    stress_w = damage_w = 0.0
    for p in analysed:
        r, area = ai[p.id], p.area_ha or 0.0
        cls = r.health_class.value if r.health_class else "unknown"
        health_ha[cls] += area
        health_n[cls] += 1
        crop = r.crop_pred or "unclassified"
        crop_ha[crop] += area
        crop_n[crop] += 1
        stress_w += (r.stress_pct or 0.0) * area
        damage_w += (r.damage_pct or 0.0) * area

    verified_any = [p for p in analysed if p.id in ver]
    verified_ok = [p for p in verified_any if ver[p.id].decision and ver[p.id].decision.value == "verified"]

    contains_demo = any(s.is_demo for s in surveys) or any(r.is_demo for r in ai.values())
    return {
        "cards": {
            "total_surveyed_area_ha": round(union_area_ha(db, [s.id for s in surveys if s.aoi is not None]), 2),
            "active_surveys": sum(1 for s in surveys if s.status in ACTIVE_STATUSES),
            "completed_surveys": sum(1 for s in surveys if s.status in DONE_STATUSES),
            "fields_analysed": len(analysed),
            "analysed_area_ha": round(analysed_ha, 2),
            "healthy_pct": _pct(health_ha["healthy"], analysed_ha),
            "stress_pct": round(stress_w / analysed_ha, 1) if analysed_ha else None,
            "possible_damage_pct": round(damage_w / analysed_ha, 1) if analysed_ha else None,
            "pending_verifications": len(analysed) - len(verified_any),
        },
        "crop_distribution": sorted(
            (
                {"crop": c, "area_ha": round(a, 2), "plots": crop_n[c], "pct": _pct(a, analysed_ha)}
                for c, a in crop_ha.items()
            ),
            key=lambda row: -row["area_ha"],
        ),
        "health": [
            {"health_class": c, "area_ha": round(health_ha[c], 2), "plots": health_n[c], "pct": _pct(health_ha[c], analysed_ha)}
            for c in ("healthy", "moderate", "severe")
        ],
        "verification_funnel": [
            {"stage": "ai_analysed", "label": "AI analysed", "plots": len(analysed)},
            {"stage": "field_verified", "label": "Field verified", "plots": len(verified_any)},
            {"stage": "confirmed", "label": "Confirmed by verifier", "plots": len(verified_ok)},
        ],
        "basis": {
            "survey_ids": [str(s.id) for s in basis],
            "description": "Latest processed survey of each area; percentages are area-weighted over analysed plots.",
        },
        "contains_demo": contains_demo,
    }
