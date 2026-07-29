"""
models.py
---------
Pydantic data models and LangGraph TypedDict state for the pipeline.
"""

from __future__ import annotations

from typing import List, Optional, TypedDict

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Pydantic schemas (used by identify_children_node)
# ---------------------------------------------------------------------------

class ChildName(BaseModel):
    """A single child name identified from the report."""
    name: str = Field(description="Full name of the child exactly as written in the report")


class IdentifiedChildren(BaseModel):
    """Top-level container for the name-identification node."""
    children: List[ChildName] = Field(
        description="List of every child mentioned in the report"
    )


# ---------------------------------------------------------------------------
# LangGraph pipeline state
# ---------------------------------------------------------------------------

class PipelineState(TypedDict):
    # ── Inputs ──────────────────────────────────────────────────────────────
    raw_report: str                          # Raw pasted text
    report_title: str                        # User-provided title
    report_date: str                         # ISO date (YYYY-MM-DD)
    coaches: List[str]                       # Coach names

    # ── Center context ───────────────────────────────────────────────────────
    selected_center_id: Optional[str]        # ObjectId string of chosen center
    selected_center_name: Optional[str]      # Display name of chosen center

    # ── Node 1: extract_all ─────────────────────────────────────────────────
    # Flat list of names identified from the report
    identified_names: Optional[List[str]]
    # Intermediate: full extracted dicts (name + background + psych + actions)
    # passed from extract_all_node to match_children_node
    _extracted_children: Optional[List[dict]]

    # ── Node 2: match_children ───────────────────────────────────────────────
    # Each dict: {name, db_id, db_name, matched, center_id, profile,
    #             generalBackground, psychologicalNotes, actionItems}
    matched_children: Optional[List[dict]]

    # ── Duplicate prevention ─────────────────────────────────────────────────
    # SHA-256 fingerprint of the normalized report text; stored inside each
    # observation so per-child pushes can be made idempotent.
    report_hash: Optional[str]
    # True when the user explicitly chose "Save anyway" for a duplicate.
    force_save: Optional[bool]

    # ── Save output ──────────────────────────────────────────────────────────
    save_results: Optional[List[dict]]

    # ── Error propagation ────────────────────────────────────────────────────
    error: Optional[str]
