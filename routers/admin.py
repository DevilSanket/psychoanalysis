"""
routers/admin.py
----------------
APIRouter for admin authentication and unmatched children resolution queue.
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime
from typing import Optional
from bson import ObjectId

from fastapi import APIRouter, HTTPException

from common import (
    AdminLoginRequest,
    ResolveUnmatchedRequest,
    _admin_password,
    _admin_sessions,
    _validate_admin_token,
    jsonable,
)
from db import (
    get_centers_collection,
    get_children_collection,
    get_coach_ids_by_names,
    get_unmatched_collection,
)

router = APIRouter(prefix="/api/admin", tags=["Admin Auth & Queue"])


@router.post("/login")
def admin_login(req: AdminLoginRequest) -> dict:
    if req.password != _admin_password:
        raise HTTPException(status_code=403, detail="Invalid admin password")
    token = hashlib.sha256(os.urandom(32)).hexdigest()
    _admin_sessions[token] = datetime.utcnow()
    return {"ok": True, "token": token, "message": "Authenticated"}


@router.get("/unmatched")
def admin_unmatched_children(
    token: str = "",
    center_name: Optional[str] = None,
    status: Optional[str] = None,
) -> dict:
    if not _validate_admin_token(token):
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")

    collection = get_unmatched_collection()
    centers = {c["name"]: str(c["_id"]) for c in get_centers_collection().find({}, {"name": 1})}

    query: dict = {}
    if center_name:
        query["balgruha_name"] = center_name
    if status:
        query["status"] = status

    entries = list(collection.find(query).sort("created_at", -1))
    return {
        "entries": [jsonable(e) for e in entries],
        "centers": sorted(centers.keys()),
        "total_pending": collection.count_documents({"status": "pending"}),
    }


@router.post("/unmatched/resolve")
def admin_resolve_unmatched(req: ResolveUnmatchedRequest) -> dict:
    if not _validate_admin_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")

    if req.action not in ("create_new", "match_existing", "dismiss"):
        raise HTTPException(status_code=400, detail="action must be create_new, match_existing, or dismiss")

    queue = get_unmatched_collection()
    try:
        entry_id = ObjectId(req.resolve_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid resolve_id")

    entry = queue.find_one({"_id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Unmatched entry not found")

    resolution: dict = {
        "action": req.action,
        "resolved_at": datetime.utcnow(),
    }

    observation = None
    if req.action in ("create_new", "match_existing"):
        report_date_str = entry.get("report_date", "")
        try:
            report_date_dt = datetime.fromisoformat(report_date_str)
        except Exception:
            report_date_dt = datetime.utcnow()

        coach_names = entry.get("coaches", [])
        coach_ids = get_coach_ids_by_names(coach_names)

        balgruha = entry.get("balgruha_name", "")
        center_doc = get_centers_collection().find_one({"name": balgruha})
        center_oid = center_doc["_id"] if center_doc else None

        observation = {
            "date":               report_date_dt,
            "reportTitle":        entry.get("report_title", "Untitled Report"),
            "centerName":         balgruha,
            "generalBackground":  entry.get("generalBackground", ""),
            "psychologistName":   entry.get("psychologistName", ""),
            "testsDone":          entry.get("testsDone", ""),
            "observations":       entry.get("observations", ""),
            "followUp":           entry.get("followUp", ""),
            "psychologicalNotes": entry.get("psychologicalNotes", ""),
            "actionItems":        entry.get("actionItems", []),
            "coachesInvolved":    coach_names,
            "coach_ids":          coach_ids,
            "center_id":          center_oid,
            "report_hash":        entry.get("report_hash"),
        }

    if req.action == "create_new":
        child_name = req.child_name.strip()
        balgruha = req.balgruha_name.strip()
        if not child_name:
            child_name = entry["extracted_name"]
        if not balgruha:
            balgruha = entry["balgruha_name"]

        collection = get_children_collection()
        existing = collection.find_one(
            {
                "child_name": re.compile(f"^{re.escape(child_name)}$", re.IGNORECASE),
                "balgruha_name": balgruha,
            }
        )
        if existing:
            resolution["action"] = "match_existing"
            resolution["child_id"] = str(existing["_id"])
            resolution["matched_child_name"] = existing.get("child_name", "")
            resolution["notes"] = "Name collided with existing DB entry during create_new"
            
            if observation:
                report_hash = observation.get("report_hash")
                query = {"_id": existing["_id"]}
                if report_hash:
                    query["observations.report_hash"] = {"$ne": report_hash}
                collection.update_one(query, {"$push": {"observations": observation}})

            queue.update_one(
                {"_id": entry_id},
                {
                    "$set": {
                        "status": "matched",
                        "resolved_at": datetime.utcnow(),
                        "resolution": resolution,
                    }
                },
            )
            return jsonable({**entry, "status": "matched", "resolution": resolution})

        doc = {
            "child_name": child_name,
            "balgruha_name": balgruha,
            "class_studying": (req.class_studying or entry.get("class_studying") or "").strip(),
            "dob": (req.dob or "").strip(),
            "school": (req.school or "").strip(),
            "parent_status": (req.parent_status or "").strip(),
            "languages": (req.languages or "").strip(),
            "strengths": (req.strengths or "").strip(),
            "weakness": (req.weakness or "").strip(),
            "nature_behavior": (req.nature_behavior or "").strip(),
            "photo_url": "",
            "observations": [observation] if observation else [],
            "created_at": datetime.utcnow(),
            "created_via": "admin_panel",
        }
        result = collection.insert_one(doc)
        resolution["child_id"] = str(result.inserted_id)
        resolution["child_name"] = child_name

    elif req.action == "match_existing":
        if not req.match_child_id:
            raise HTTPException(status_code=400, detail="match_child_id required for match_existing")
        try:
            match_oid = ObjectId(req.match_child_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid match_child_id")
        collection = get_children_collection()
        existing = collection.find_one({"_id": match_oid})
        if not existing:
            raise HTTPException(status_code=404, detail="Target child not found in DB")
        resolution["child_id"] = str(existing["_id"])
        resolution["matched_child_name"] = existing.get("child_name", "")

        if observation:
            report_hash = observation.get("report_hash")
            query = {"_id": match_oid}
            if report_hash:
                query["observations.report_hash"] = {"$ne": report_hash}
            collection.update_one(query, {"$push": {"observations": observation}})

    elif req.action == "dismiss":
        resolution["notes"] = "Dismissed by admin — false positive or irrelevant"

    new_status = "created" if req.action == "create_new" else ("matched" if req.action == "match_existing" else "dismissed")

    queue.update_one(
        {"_id": entry_id},
        {
            "$set": {
                "status": new_status,
                "resolved_at": resolution["resolved_at"],
                "resolution": resolution,
            }
        },
    )

    entry["status"] = new_status
    entry["resolution"] = resolution
    return jsonable(entry)
