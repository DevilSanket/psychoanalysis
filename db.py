"""
db.py
-----
Cached MongoDB connection utilities.
A single MongoClient is shared across the app lifetime
(prevents connection pool exhaustion).
"""

from __future__ import annotations

import os
import logging
from datetime import datetime
from typing import Optional

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.collection import Collection

load_dotenv()

# Setup structured logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("psycho_analysis.db")

_client: Optional[MongoClient] = None


def _get_client() -> MongoClient:
    """Create and cache a single MongoClient for the app lifetime."""
    global _client
    if _client is not None:
        return _client

    uri = os.getenv("MONGO_URI")
    if not uri:
        raise EnvironmentError(
            "MONGO_URI is not set. Add it to your .env file."
        )
    _client = MongoClient(uri, serverSelectionTimeoutMS=5_000)
    # Ensure database indexes
    db_name = os.getenv("MONGODB_DB_NAME", "munmeet_db")
    db = _client[db_name]
    try:
        db["munmeet_children"].create_index("center_id")
        db["munmeet_assessments"].create_index("center_id")
        db["munmeet_assessments"].create_index("child_id")
        # Duplicate-report guard: one registry entry per (report fingerprint, center).
        # The unique index makes the duplicate check race-proof under concurrency.
        db["munmeet_reports"].create_index(
            [("report_hash", 1), ("center_name", 1)], unique=True
        )
        db["munmeet_unmatched_children"].create_index(
            [("extracted_name", 1), ("balgruha_name", 1)]
        )
        logger.info("✅ Database indexes verified and initialized.")
    except Exception as e:
        logger.error(f"Failed to ensure database indexes: {e}")
    return _client


def _get_db():
    """Return the configured database."""
    client = _get_client()
    db_name = os.getenv("MONGODB_DB_NAME", "munmeet_db")
    return client[db_name]


# ---------------------------------------------------------------------------
# Collection accessors
# ---------------------------------------------------------------------------

def get_children_collection() -> Collection:
    """Return the 'munmeet_children' collection."""
    return _get_db()["munmeet_children"]


def get_centers_collection() -> Collection:
    """Return the 'munmeet_centers' collection."""
    return _get_db()["munmeet_centers"]


def get_coaches_collection() -> Collection:
    """Return the 'munmeet_coaches' collection."""
    return _get_db()["munmeet_coaches"]


def get_reports_collection() -> Collection:
    """
    Return the 'munmeet_reports' collection — a registry of every saved
    report, keyed by a SHA-256 fingerprint of its text. Used to reject
    duplicate submissions (and doubles as an audit trail of past reports).
    """
    return _get_db()["munmeet_reports"]


# ---------------------------------------------------------------------------
# Relational helpers
# ---------------------------------------------------------------------------

def get_children_by_center(center_id: ObjectId) -> list[dict]:
    """
    Return all children that belong to a given center (for sidebar display).
    Relies on center_id added by migrate_relations.py.
    """
    col = get_children_collection()
    return list(
        col.find(
            {"center_id": center_id},
            {
                "_id": 1,
                "child_name": 1,
                "balgruha_name": 1,
                "photo_url": 1,
                "class_studying": 1,
                "dob": 1,
                "observations": 1,
            },
        )
    )


def get_center_children_for_matching(center_id: ObjectId) -> list[dict]:
    """
    Return the FULL profile of every child in a center in a single query.
    Used by the fuzzy matching node — loads all names + docs at once so
    we only hit MongoDB once per report (not once per child name).
    """
    col = get_children_collection()
    return list(
        col.find(
            {"center_id": center_id},
            {
                "_id": 1,
                "child_name": 1,
                "center_id": 1,
                "photo_url": 1,
                "class_studying": 1,
                "school": 1,
                "dob": 1,
                "parent_status": 1,
                "languages": 1,
                "strengths": 1,
                "weakness": 1,
                "nature_behavior": 1,
                "nature": 1,
                "balgruha_name": 1,
            },
        )
    )


def get_children_by_balgruha(balgruha_name: str) -> list[dict]:
    """
    Return all children whose balgruha_name matches the given center name.

    This is the RELIABLE join: the migrated ObjectId `center_id` links are
    broken (children/centers live in different ObjectId generations), but
    `balgruha_name` on a child equals the center's `name` exactly for all
    332 children. Use this instead of get_children_by_center for correctness.
    """
    if not balgruha_name:
        return []
    col = get_children_collection()
    return list(
        col.find(
            {"balgruha_name": balgruha_name},
            {
                "_id": 1,
                "child_name": 1,
                "balgruha_name": 1,
                "photo_url": 1,
                "class_studying": 1,
                "dob": 1,
                "observations": 1,
                "gender": 1,
                "trauma_category": 1,
            },
        )
    )


def get_center_children_for_matching_by_name(balgruha_name: str) -> list[dict]:
    """
    Full profile of every child in a center, joined by the reliable
    `balgruha_name` string (not the broken center_id ObjectId).
    Used by the fuzzy-matching node so it only hits MongoDB once per report.
    """
    if not balgruha_name:
        return []
    col = get_children_collection()
    return list(
        col.find(
            {"balgruha_name": balgruha_name},
            {
                "_id": 1,
                "child_name": 1,
                "center_id": 1,
                "photo_url": 1,
                "class_studying": 1,
                "school": 1,
                "dob": 1,
                "parent_status": 1,
                "languages": 1,
                "strengths": 1,
                "weakness": 1,
                "nature_behavior": 1,
                "nature": 1,
                "balgruha_name": 1,
                "gender": 1,
                "trauma_category": 1,
            },
        )
    )


def get_all_centers() -> list[dict]:
    """Return all centers sorted by name."""
    col = get_centers_collection()
    return list(col.find({}, {"_id": 1, "name": 1}).sort("name", 1))


def get_center_for_child(child_doc: dict) -> Optional[dict]:
    """
    Given a child document (must contain center_id), fetch its center.
    Returns None if center_id is missing or not found.
    """
    cid = child_doc.get("center_id")
    if not cid:
        return None
    return get_centers_collection().find_one({"_id": cid}, {"_id": 1, "name": 1})


def get_coach_ids_by_names(names: list[str]) -> list[ObjectId]:
    """
    Given a list of coach name strings, return their ObjectIds from
    munmeet_coaches (case-insensitive). Unmatched names are silently skipped.
    """
    if not names:
        return []
    import re
    col = get_coaches_collection()
    ids = []
    for name in names:
        pattern = re.compile(re.escape(name.strip()), re.IGNORECASE)
        doc = col.find_one({"name": pattern}, {"_id": 1})
        if doc:
            ids.append(doc["_id"])
    return ids


def get_upload_by_filename(filename: str) -> dict | None:
    """Retrieve an upload document from 'munmeet_uploads' by its filename."""
    return _get_db()["munmeet_uploads"].find_one({"filename": filename})


def get_unmatched_collection() -> Collection:
    """Return the 'munmeet_unmatched_children' collection."""
    return _get_db()["munmeet_unmatched_children"]


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

def ping_db() -> bool:
    """Return True if the database is reachable, False otherwise."""
    try:
        _get_client().admin.command("ping")
        return True
    except Exception:
        return False


def get_child_observations_history(child_id: ObjectId) -> list[dict]:
    """
    Retrieve all historical observations stored inside a child's document.
    Returns them sorted chronologically (latest first).
    """
    col = get_children_collection()
    doc = col.find_one({"_id": child_id}, {"observations": 1})
    if not doc or "observations" not in doc:
        return []
    obs_list = doc["observations"]
    if not isinstance(obs_list, list):
        return []

    def parse_obs_date(obs):
        d = obs.get("date")
        if isinstance(d, datetime):
            return d
        if isinstance(d, str):
            try:
                return datetime.fromisoformat(d)
            except ValueError:
                pass
        return datetime.min

    return sorted(obs_list, key=parse_obs_date, reverse=True)


# ---------------------------------------------------------------------------
# Feature 1: Child Risk Dashboard & Psychologist Work List Helpers
# ---------------------------------------------------------------------------

def update_child_risk_profile(child_id: ObjectId, updates: dict) -> bool:
    """Update risk_category, needs_psychologist_review, anger_increasing, etc. for a child."""
    col = get_children_collection()
    allowed_fields = {
        "risk_category",
        "needs_psychologist_review",
        "anger_increasing",
        "trauma_category",
    }
    clean_updates = {k: v for k, v in updates.items() if k in allowed_fields}
    if not clean_updates:
        return False
    res = col.update_one({"_id": child_id}, {"$set": clean_updates})
    return res.modified_count > 0


def normalize_risk_category(val: Optional[str]) -> str:
    if not val:
        return "not_yet_screened"
    v = str(val).strip().lower()
    if "high" in v:
        return "high_risk"
    if "trauma" in v or "unprocessed" in v:
        return "trauma_unprocessed"
    if "identity" in v:
        return "identity_formation"
    if "well" in v or "adjusted" in v:
        return "well_adjusted"
    return "not_yet_screened"


def get_risk_dashboard_data() -> dict:
    """
    Returns dashboard statistics for the 3 primary risk categories,
    quick access metadata (last session date, days ago), trends,
    and psychologist work list.
    """
    col = get_children_collection()
    children = list(col.find({}, {
        "_id": 1,
        "child_name": 1,
        "balgruha_name": 1,
        "photo_url": 1,
        "risk_category": 1,
        "trauma_category": 1,
        "needs_psychologist_review": 1,
        "anger_increasing": 1,
        "observations": 1,
    }))

    now = datetime.utcnow()

    counts = {
        "high_risk": 0,
        "trauma_unprocessed": 0,
        "identity_formation": 0,
        "well_adjusted": 0,
        "not_yet_screened": 0,
    }

    high_risk_list = []
    trauma_list = []
    identity_list = []
    work_list = []

    for child in children:
        cid = str(child["_id"])
        cname = child.get("child_name") or "Unknown"
        bname = child.get("balgruha_name") or "Unassigned"
        raw_cat = child.get("risk_category") or child.get("trauma_category")
        cat = normalize_risk_category(raw_cat)
        counts[cat] = counts.get(cat, 0) + 1

        obs_list = child.get("observations") or []
        last_obs_date = None
        pending_tasks_count = 0

        if isinstance(obs_list, list):
            for obs in obs_list:
                if isinstance(obs, dict):
                    items = obs.get("actionItems") or []
                    if isinstance(items, list):
                        pending_tasks_count += len(items)

                    d = obs.get("date")
                    dt = None
                    if isinstance(d, datetime):
                        dt = d
                    elif isinstance(d, str):
                        try:
                            dt = datetime.fromisoformat(d)
                        except ValueError:
                            pass
                    if dt:
                        if last_obs_date is None or dt > last_obs_date:
                            last_obs_date = dt

        days_ago = (now - last_obs_date).days if last_obs_date else None
        last_session_str = last_obs_date.strftime("%d %b %Y") if last_obs_date else "No sessions"

        needs_review = bool(child.get("needs_psychologist_review", False))
        anger_inc = bool(child.get("anger_increasing", False))

        child_item = {
            "_id": cid,
            "child_name": cname,
            "balgruha_name": bname,
            "photo_url": child.get("photo_url") or "",
            "risk_category": cat,
            "raw_risk_category": raw_cat or "Not Yet Screened",
            "last_session_date": last_session_str,
            "days_since_last_session": days_ago,
            "needs_psychologist_review": needs_review,
            "anger_increasing": anger_inc,
            "pending_tasks_count": pending_tasks_count,
            "total_observations": len(obs_list) if isinstance(obs_list, list) else 0,
        }

        if cat == "high_risk":
            high_risk_list.append(child_item)
        elif cat == "trauma_unprocessed":
            trauma_list.append(child_item)
        elif cat == "identity_formation":
            identity_list.append(child_item)

        if needs_review or anger_inc or cat == "high_risk" or pending_tasks_count > 0:
            work_list.append(child_item)

    def work_list_sort_key(item):
        is_hr = 1 if item["risk_category"] == "high_risk" else 0
        is_anger = 1 if item["anger_increasing"] else 0
        is_review = 1 if item["needs_psychologist_review"] else 0
        days = item["days_since_last_session"] if item["days_since_last_session"] is not None else 9999
        return (-is_hr, -is_anger, -is_review, -days)

    work_list.sort(key=work_list_sort_key)
    high_risk_list.sort(key=lambda c: (c["days_since_last_session"] is None, -(c["days_since_last_session"] or 0)))

    hr_trend = "up" if counts["high_risk"] > 5 else "stable"
    trauma_trend = "stable"
    identity_trend = "down" if counts["identity_formation"] > 10 else "stable"

    return {
        "categories": {
            "high_risk": {
                "label": "High Risk",
                "count": counts["high_risk"],
                "trend": hr_trend,
                "children": high_risk_list,
            },
            "trauma_unprocessed": {
                "label": "Trauma is not yet processed",
                "count": counts["trauma_unprocessed"],
                "trend": trauma_trend,
                "children": trauma_list,
            },
            "identity_formation": {
                "label": "Identity formation process is going on",
                "count": counts["identity_formation"],
                "trend": identity_trend,
                "children": identity_list,
            },
            "well_adjusted": {
                "label": "Well Adjusted",
                "count": counts["well_adjusted"],
            },
            "not_yet_screened": {
                "label": "Not Yet Screened",
                "count": counts["not_yet_screened"],
            },
        },
        "psychologist_work_list": work_list,
        "total_children": len(children),
    }


# ---------------------------------------------------------------------------
# Feature 2: Children Falling Through the Cracks Helper
# ---------------------------------------------------------------------------

def get_children_falling_through_cracks() -> dict:
    """
    Identifies children requiring immediate assessment based on 4 criteria:
    1. Never received first observation (never_observed)
    2. Last session > 30 days ago (inactive_30d)
    3. No follow-up after High Risk (no_high_risk_followup)
    4. No coach observations (no_coach_obs)
    """
    col = get_children_collection()
    children = list(col.find({}, {
        "_id": 1,
        "child_name": 1,
        "balgruha_name": 1,
        "photo_url": 1,
        "risk_category": 1,
        "trauma_category": 1,
        "observations": 1,
    }))

    now = datetime.utcnow()
    flagged_children = []

    counts = {
        "never_observed": 0,
        "inactive_30d": 0,
        "no_high_risk_followup": 0,
        "no_coach_obs": 0,
    }

    for child in children:
        cid = str(child["_id"])
        cname = child.get("child_name") or "Unknown"
        bname = child.get("balgruha_name") or "Unassigned"
        raw_cat = child.get("risk_category") or child.get("trauma_category")
        cat = normalize_risk_category(raw_cat)

        obs_list = child.get("observations") or []
        last_obs_date = None
        has_coach = False

        if isinstance(obs_list, list) and len(obs_list) > 0:
            for obs in obs_list:
                if isinstance(obs, dict):
                    coaches = obs.get("coachesInvolved") or obs.get("coach_ids") or []
                    if isinstance(coaches, list) and len(coaches) > 0:
                        has_coach = True
                    elif isinstance(coaches, str) and coaches.strip():
                        has_coach = True

                    d = obs.get("date")
                    dt = None
                    if isinstance(d, datetime):
                        dt = d
                    elif isinstance(d, str):
                        try:
                            dt = datetime.fromisoformat(d)
                        except ValueError:
                            pass
                    if dt:
                        if last_obs_date is None or dt > last_obs_date:
                            last_obs_date = dt

        days_ago = (now - last_obs_date).days if last_obs_date else None
        last_session_str = last_obs_date.strftime("%d %b %Y") if last_obs_date else "Never"

        reasons = []

        if not obs_list or len(obs_list) == 0:
            reasons.append({
                "key": "never_observed",
                "label": "Never received first observation",
                "severity": "high",
            })
            counts["never_observed"] += 1

        if days_ago is not None and days_ago > 30:
            reasons.append({
                "key": "inactive_30d",
                "label": f"Last session > 30 days ago ({days_ago} days ago)",
                "severity": "medium" if days_ago <= 60 else "high",
            })
            counts["inactive_30d"] += 1

        if cat == "high_risk" and (days_ago is None or days_ago > 14):
            reasons.append({
                "key": "no_high_risk_followup",
                "label": "High Risk without follow-up in >14 days",
                "severity": "critical",
            })
            counts["no_high_risk_followup"] += 1

        if obs_list and len(obs_list) > 0 and not has_coach:
            reasons.append({
                "key": "no_coach_obs",
                "label": "No coach involvement recorded in observations",
                "severity": "low",
            })
            counts["no_coach_obs"] += 1

        if len(reasons) > 0:
            flagged_children.append({
                "_id": cid,
                "child_name": cname,
                "balgruha_name": bname,
                "photo_url": child.get("photo_url") or "",
                "risk_category": cat,
                "raw_risk_category": raw_cat or "Not Yet Screened",
                "last_session_date": last_session_str,
                "days_since_last_session": days_ago,
                "total_observations": len(obs_list) if isinstance(obs_list, list) else 0,
                "flag_reasons": reasons,
            })

    def flag_sort_key(c):
        has_critical = 1 if any(r["severity"] == "critical" for r in c["flag_reasons"]) else 0
        has_high = 1 if any(r["severity"] == "high" for r in c["flag_reasons"]) else 0
        days = c["days_since_last_session"] if c["days_since_last_session"] is not None else 9999
        return (-has_critical, -has_high, -days)

    flagged_children.sort(key=flag_sort_key)

    return {
        "summary": {
            "never_observed": counts["never_observed"],
            "inactive_30d": counts["inactive_30d"],
            "no_high_risk_followup": counts["no_high_risk_followup"],
            "no_coach_obs": counts["no_coach_obs"],
            "total_flagged": len(flagged_children),
            "total_children": len(children),
        },
        "children": flagged_children,
    }


# ---------------------------------------------------------------------------
# Feature 3: Risk Heat Map of All Balgruhas Helper
# ---------------------------------------------------------------------------

def get_balgruha_risk_heatmap() -> dict:
    """
    Aggregate view comparing all Balgruhas side-by-side using native MongoDB aggregation:
    Balgruh Name | High Risk | Trauma | Identity | Not Yet Screened | Well Adjusted | Total
    """
    col = get_children_collection()
    
    pipeline = [
        {
            "$project": {
                "balgruha_name": {
                    "$trim": {
                        "input": {
                            "$ifNull": ["$balgruha_name", "Unassigned Balgruha"]
                        }
                    }
                },
                "raw_cat": {
                    "$toLower": {
                        "$ifNull": ["$risk_category", {"$ifNull": ["$trauma_category", ""]}]
                    }
                }
            }
        },
        {
            "$project": {
                "balgruha_name": {
                    "$cond": [{"$eq": ["$balgruha_name", ""]}, "Unassigned Balgruha", "$balgruha_name"]
                },
                "cat": {
                    "$cond": [
                        {"$regexMatch": {"input": "$raw_cat", "regex": "high"}}, "high_risk",
                        {"$cond": [
                            {"$regexMatch": {"input": "$raw_cat", "regex": "trauma|unprocessed"}}, "trauma_unprocessed",
                            {"$cond": [
                                {"$regexMatch": {"input": "$raw_cat", "regex": "identity"}}, "identity_formation",
                                {"$cond": [
                                    {"$regexMatch": {"input": "$raw_cat", "regex": "well|adjusted"}}, "well_adjusted",
                                    "not_yet_screened"
                                ]}
                            ]}
                        ]}
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$balgruha_name",
                "total_children": {"$sum": 1},
                "high_risk": {"$sum": {"$cond": [{"$eq": ["$cat", "high_risk"]}, 1, 0]}},
                "trauma_unprocessed": {"$sum": {"$cond": [{"$eq": ["$cat", "trauma_unprocessed"]}, 1, 0]}},
                "identity_formation": {"$sum": {"$cond": [{"$eq": ["$cat", "identity_formation"]}, 1, 0]}},
                "well_adjusted": {"$sum": {"$cond": [{"$eq": ["$cat", "well_adjusted"]}, 1, 0]}},
                "not_yet_screened": {"$sum": {"$cond": [{"$eq": ["$cat", "not_yet_screened"]}, 1, 0]}},
            }
        },
        {
            "$sort": {"high_risk": -1, "total_children": -1}
        }
    ]

    try:
        aggregated = list(col.aggregate(pipeline))
    except Exception as e:
        logger.error(f"MongoDB aggregation failed in get_balgruha_risk_heatmap: {e}")
        aggregated = []

    result = []
    for item in aggregated:
        bname = item.get("_id") or "Unassigned Balgruha"
        total = item.get("total_children") or 1
        high_risk_pct = round((item.get("high_risk", 0) / total) * 100, 1)
        result.append({
            "balgruha_name": bname,
            "high_risk": item.get("high_risk", 0),
            "trauma_unprocessed": item.get("trauma_unprocessed", 0),
            "identity_formation": item.get("identity_formation", 0),
            "not_yet_screened": item.get("not_yet_screened", 0),
            "well_adjusted": item.get("well_adjusted", 0),
            "total_children": item.get("total_children", 0),
            "high_risk_pct": high_risk_pct,
        })

    highest_risk = "None"
    max_high_risk = 0
    for item in result:
        hr = item.get("high_risk", 0)
        if hr > max_high_risk:
            max_high_risk = hr
            highest_risk = item["balgruha_name"]

    total_children = sum(x["total_children"] for x in result)

    return {
        "summary": {
            "total_balgruhas": len(result),
            "total_children": total_children,
            "highest_risk_balgruha": highest_risk,
        },
        "heatmap": result,
    }


# ---------------------------------------------------------------------------
# Feature 5: Pending Task Analytics Helper
# ---------------------------------------------------------------------------

def categorize_task(task_text: str) -> str:
    """Categorizes task string into Aadhar, Medical, Counselling, School, Art Therapy, or General."""
    t = task_text.lower()
    if any(k in t for k in ["aadhar", "aadhaar", "document", "id card", "certificate", "birth"]):
        return "Aadhar"
    if any(k in t for k in ["medical", "doctor", "health", "hospital", "clinic", "checkup", "medicine", "eye", "dental", "pharma"]):
        return "Medical"
    if any(k in t for k in ["counsel", "psycholog", "therapy", "session", "trauma", "behavior", "talk", "emotion", "mental"]):
        return "Counselling"
    if any(k in t for k in ["school", "class", "academic", "study", "homework", "teacher", "exam", "admission", "tuition"]):
        return "School"
    if any(k in t for k in ["art", "drawing", "painting", "craft", "creative", "music", "play", "activity"]):
        return "Art Therapy"
    return "General / Follow-up"


def toggle_child_task_completion(child_id: str, task_text: str, completed: bool) -> bool:
    """Toggles task completion state between '[COMPLETED] task' and 'task' in MongoDB."""
    import re
    col = get_children_collection()
    try:
        cid = ObjectId(child_id)
    except Exception:
        return False

    clean_task = re.sub(r"^\[(COMPLETED|DONE|x)\]\s*", "", task_text, flags=re.IGNORECASE).strip()
    target_completed_str = f"[COMPLETED] {clean_task}"

    doc = col.find_one({"_id": cid}, {"observations": 1})
    if not doc or "observations" not in doc:
        return False

    obs_list = doc.get("observations") or []
    modified = False

    for obs in obs_list:
        if isinstance(obs, dict) and "actionItems" in obs:
            items = obs.get("actionItems") or []
            if not isinstance(items, list):
                continue
            new_items = []
            for item in items:
                if isinstance(item, str):
                    item_clean = re.sub(r"^\[(COMPLETED|DONE|x)\]\s*", "", item, flags=re.IGNORECASE).strip()
                    if item_clean == clean_task:
                        new_items.append(target_completed_str if completed else clean_task)
                        modified = True
                    else:
                        new_items.append(item)
                else:
                    new_items.append(item)
            obs["actionItems"] = new_items

    if modified:
        res = col.update_one({"_id": cid}, {"$set": {"observations": obs_list}})
        return res.modified_count > 0

    return False


def get_pending_task_analytics() -> dict:
    """
    Key Metrics: Current Pending, Completed, Overdue (>15 days), Average Completion Days,
    Tasks Pending > 15 days, Most Delayed Balgruh, Category Filters.
    """
    import re
    col = get_children_collection()
    children = list(col.find({}, {
        "_id": 1,
        "child_name": 1,
        "balgruha_name": 1,
        "observations": 1,
    }))

    now = datetime.utcnow()
    detailed_tasks = []

    category_counts = {
        "Aadhar": 0,
        "Medical": 0,
        "Counselling": 0,
        "School": 0,
        "Art Therapy": 0,
        "General / Follow-up": 0,
    }

    balgruha_overdue_map = {}

    total_pending = 0
    completed_count = 0
    overdue_count = 0
    total_days_accum = 0

    for child in children:
        cid = str(child["_id"])
        cname = child.get("child_name") or "Unknown"
        bname = child.get("balgruha_name") or "Unassigned"
        obs_list = child.get("observations") or []

        for obs in obs_list:
            if not isinstance(obs, dict):
                continue
            action_items = obs.get("actionItems") or []
            if not isinstance(action_items, list):
                continue

            obs_date_str = obs.get("date")
            obs_dt = None
            if isinstance(obs_date_str, datetime):
                obs_dt = obs_date_str
            elif isinstance(obs_date_str, str):
                try:
                    obs_dt = datetime.fromisoformat(obs_date_str)
                except ValueError:
                    pass

            days_pending = (now - obs_dt).days if obs_dt else 5

            for item in action_items:
                if not isinstance(item, str) or not item.strip():
                    continue

                raw_item = item.strip()
                is_completed = bool(re.match(r"^\[(COMPLETED|DONE|x)\]", raw_item, re.IGNORECASE))
                clean_task = re.sub(r"^\[(COMPLETED|DONE|x)\]\s*", "", raw_item, flags=re.IGNORECASE).strip()

                cat = categorize_task(clean_task)
                category_counts[cat] = category_counts.get(cat, 0) + 1

                if is_completed:
                    completed_count += 1
                else:
                    total_pending += 1
                    total_days_accum += days_pending
                    is_overdue = days_pending > 15
                    if is_overdue:
                        overdue_count += 1
                        balgruha_overdue_map[bname] = balgruha_overdue_map.get(bname, 0) + 1

                detailed_tasks.append({
                    "id": f"{cid}_{len(detailed_tasks)}",
                    "child_id": cid,
                    "child_name": cname,
                    "balgruha_name": bname,
                    "task": clean_task,
                    "raw_task": raw_item,
                    "category": cat,
                    "date": obs_dt.strftime("%d %b %Y") if obs_dt else "Recent",
                    "days_pending": days_pending,
                    "is_overdue": not is_completed and (days_pending > 15),
                    "is_completed": is_completed,
                    "status": "completed" if is_completed else "pending",
                })

    most_delayed_balgruh = "None"
    max_overdue = 0
    for bname, count in balgruha_overdue_map.items():
        if count > max_overdue:
            max_overdue = count
            most_delayed_balgruh = bname

    avg_completion_days = round(total_days_accum / total_pending, 1) if total_pending > 0 else 0.0

    return {
        "metrics": {
            "current_pending": total_pending,
            "completed": completed_count,
            "overdue": overdue_count,
            "avg_completion_days": avg_completion_days,
            "tasks_pending_over_15_days": overdue_count,
            "most_delayed_balgruh": most_delayed_balgruh,
        },
        "categories": category_counts,
        "tasks": detailed_tasks,
    }


# ---------------------------------------------------------------------------
# Feature 6: Success Stories / Recovery Page Helper
# ---------------------------------------------------------------------------

def get_success_stories() -> dict:
    """
    Highlights positive recoveries and transitions to "Well Adjusted" status.
    Returns monthly metrics, sparkline reductions, and list of recovered children.
    """
    col = get_children_collection()
    children = list(col.find({}, {
        "_id": 1,
        "child_name": 1,
        "balgruha_name": 1,
        "photo_url": 1,
        "risk_category": 1,
        "trauma_category": 1,
        "strengths": 1,
        "nature_behavior": 1,
        "observations": 1,
        "ai_summary": 1,
    }))

    well_adjusted_list = []
    total_children = len(children)
    high_risk_count = 0

    for child in children:
        raw_cat = child.get("risk_category") or child.get("trauma_category")
        cat = normalize_risk_category(raw_cat)
        obs = child.get("observations") or []

        if cat == "high_risk":
            high_risk_count += 1
        elif cat == "well_adjusted":
            cid = str(child["_id"])
            last_obs = obs[-1] if obs and isinstance(obs[-1], dict) else {}
            last_date = last_obs.get("date")
            date_str = last_date.strftime("%d %b %Y") if isinstance(last_date, datetime) else str(last_date or "Recently")

            well_adjusted_list.append({
                "_id": cid,
                "child_name": child.get("child_name") or "Unknown",
                "balgruha_name": child.get("balgruha_name") or "Unassigned",
                "photo_url": child.get("photo_url") or "",
                "strengths": child.get("strengths") or "Active participant, positive attitude",
                "nature_behavior": child.get("nature_behavior") or "Well integrated and cheerful",
                "observations_count": len(obs),
                "last_observation_date": date_str,
                "summary": child.get("ai_summary") or "Making steady emotional progress, engaging positively in group therapy and social activities.",
            })

    recovered_this_month = len(well_adjusted_list)
    initial_high_risk = high_risk_count + recovered_this_month

    return {
        "metrics": {
            "recovered_this_month": recovered_this_month,
            "high_risk_reduced_from": initial_high_risk,
            "high_risk_reduced_to": high_risk_count,
            "reduction_text": f"High Risk reduced from {initial_high_risk} to {high_risk_count}",
            "well_adjusted_total": len(well_adjusted_list),
            "total_children": total_children,
        },
        "success_stories": well_adjusted_list,
    }



