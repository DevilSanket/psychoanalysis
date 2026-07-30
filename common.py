"""
common.py
---------
Shared request models, serialization helpers, and utility functions for the API routers.
"""

from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any, Optional

from bson import ObjectId
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Admin authentication session store
# ---------------------------------------------------------------------------

_admin_password = os.getenv("ADMIN_PASSWORD", "isfadmin").strip()
_admin_sessions: dict[str, datetime] = {}
ADMIN_SESSION_DURATION_MINUTES = 60


def _validate_admin_token(token: str) -> bool:
    """Check if token is valid and not expired. Remove expired tokens."""
    if token not in _admin_sessions:
        return False
    session_time = _admin_sessions[token]
    if (datetime.utcnow() - session_time).total_seconds() > ADMIN_SESSION_DURATION_MINUTES * 60:
        del _admin_sessions[token]
        return False
    return True


# ---------------------------------------------------------------------------
# Serialization helper
# ---------------------------------------------------------------------------

def jsonable(value: Any) -> Any:
    """Recursively convert ObjectId / datetime into JSON-friendly primitives."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(v) for v in value]
    return value


# ---------------------------------------------------------------------------
# Request Pydantic Schemas
# ---------------------------------------------------------------------------

class ExtractRequest(BaseModel):
    raw_report: str
    report_title: str = "Untitled Report"
    report_date: str = ""           # ISO YYYY-MM-DD
    coaches: list[str] = []
    center_id: Optional[str] = None
    center_name: Optional[str] = None
    force: bool = False


class SaveRequest(BaseModel):
    report_title: str = "Untitled Report"
    report_date: str = ""
    coaches: list[str] = []
    center_id: Optional[str] = None
    center_name: Optional[str] = None
    matched_children: list[dict] = []
    raw_report: str = ""
    force: bool = False


class RematchRequest(BaseModel):
    name: str
    center_name: Optional[str] = None


class ConfirmMatchRequest(BaseModel):
    db_id: str
    name: str
    score: int = 100


class DeleteObservationRequest(BaseModel):
    date: Optional[str] = None
    reportTitle: Optional[str] = None
    scope: str = "single"


class UpdateObservationRequest(BaseModel):
    report_hash: Optional[str] = None
    date: Optional[str] = None
    reportTitle: Optional[str] = None
    fields: dict


class CreateChildRequest(BaseModel):
    child_name: str
    balgruha_name: str
    class_studying: Optional[str] = None
    dob: Optional[str] = None
    school: Optional[str] = None
    parent_status: Optional[str] = None
    languages: Optional[str] = None
    strengths: Optional[str] = None
    weakness: Optional[str] = None
    nature_behavior: Optional[str] = None
    extracted_name: Optional[str] = None


class AskQuestionRequest(BaseModel):
    question: str


class TranslateSummaryRequest(BaseModel):
    lang: str = "hi"
    refresh: bool = False


class TranslateTasksRequest(BaseModel):
    lang: str = "hi"
    refresh: bool = False


class ToggleTaskRequest(BaseModel):
    task: str
    completed: bool = True


class QuickObservationRequest(BaseModel):
    date: Optional[str] = None
    report_title: Optional[str] = None
    observations: str
    action_items: Optional[list[str]] = []
    risk_category: Optional[str] = None
    coaches_involved: Optional[list[str]] = ["Psychologist / Social Worker"]


class AdminLoginRequest(BaseModel):
    password: str


class ResolveUnmatchedRequest(BaseModel):
    token: str
    resolve_id: str
    action: str  # "create_new", "match_existing", or "dismiss"
    child_name: str = ""
    balgruha_name: str = ""
    class_studying: Optional[str] = None
    dob: Optional[str] = None
    school: Optional[str] = None
    parent_status: Optional[str] = None
    languages: Optional[str] = None
    strengths: Optional[str] = None
    weakness: Optional[str] = None
    nature_behavior: Optional[str] = None
    match_child_id: Optional[str] = None
