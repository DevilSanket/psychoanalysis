"""
routers/analytics.py
--------------------
APIRouter for risk analytics, falling through cracks tracking, Balgruha heatmap,
pending task analytics, and success stories metrics.
"""

from __future__ import annotations

from fastapi import APIRouter

from common import jsonable
from db import (
    get_balgruha_risk_heatmap,
    get_children_falling_through_cracks,
    get_pending_task_analytics,
    get_risk_dashboard_data,
    get_success_stories,
)

router = APIRouter(prefix="/api/admin", tags=["Admin Risk Analytics"])


@router.get("/risk-dashboard")
def admin_risk_dashboard() -> dict:
    """Return 3 primary categories, trends, quick access metadata, and psychologist work list."""
    return jsonable(get_risk_dashboard_data())


@router.get("/falling-through-cracks")
def admin_falling_through_cracks() -> dict:
    """Returns overview of children requiring immediate assessment across 4 risk conditions."""
    return jsonable(get_children_falling_through_cracks())


@router.get("/balgruha-heatmap")
def admin_balgruha_heatmap() -> dict:
    """Aggregate view comparing all Balgruhas side-by-side."""
    return jsonable(get_balgruha_risk_heatmap())


@router.get("/task-analytics")
def admin_task_analytics() -> dict:
    """Returns pending task metrics, delayed balgruha stats, and category breakdowns."""
    return jsonable(get_pending_task_analytics())


@router.get("/success-stories")
def admin_success_stories() -> dict:
    """Returns monthly metrics and individual recovery stories of well-adjusted children."""
    return jsonable(get_success_stories())
