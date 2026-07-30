"""
routers/children.py
-------------------
APIRouter for child profile CRUD, observations history, report text, behavioral timeline,
pending tasks, risk profile updates, and static upload serving.
"""

from __future__ import annotations

import datetime as dt
from datetime import datetime
import json

from typing import Optional
from bson import ObjectId

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from common import (
    CreateChildRequest,
    DeleteObservationRequest,
    QuickObservationRequest,
    ToggleTaskRequest,
    UpdateObservationRequest,
    jsonable,
)
from db import (
    get_child_observations_history,
    get_children_collection,
    get_reports_collection,
    get_upload_by_filename,
    toggle_child_task_completion,
    update_child_risk_profile,
)
from pipeline import _matched_entry

router = APIRouter(prefix="/api", tags=["Children Profiles & History"])


_PROFILE_EDITABLE_FIELDS = {
    "gender", "class_studying", "school", "dob",
    "parent_status", "languages", "strengths", "weakness", "nature_behavior",
    "risk_category",
}


class UpdateProfileRequest(BaseModel):
    fields: dict


class UpdateRiskProfileRequest(BaseModel):
    risk_category: Optional[str] = None
    needs_psychologist_review: Optional[bool] = None
    anger_increasing: Optional[bool] = None


EDITABLE_OBS_FIELDS = {
    "psychologistName",
    "testsDone",
    "observations",
    "followUp",
    "psychologicalNotes",
    "generalBackground",
    "actionItems",
    "coachesInvolved",
}


@router.post("/children")
def create_child(req: CreateChildRequest) -> dict:
    """
    Create a brand-new child profile (used when a report mentions a child
    that does not yet exist in the roster).
    """
    import re
    child_name = req.child_name.strip()
    balgruha = req.balgruha_name.strip()
    if not child_name:
        raise HTTPException(status_code=400, detail="child_name is required")
    if not balgruha:
        raise HTTPException(status_code=400, detail="balgruha_name is required")

    collection = get_children_collection()

    existing = collection.find_one(
        {
            "child_name": re.compile(f"^{re.escape(child_name)}$", re.IGNORECASE),
            "balgruha_name": balgruha,
        }
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f'"{existing.get("child_name")}" already exists in {balgruha}. '
                   "Use re-match instead.",
        )

    doc = {
        "child_name": child_name,
        "balgruha_name": balgruha,
        "class_studying": (req.class_studying or "").strip(),
        "dob": (req.dob or "").strip(),
        "school": (req.school or "").strip(),
        "parent_status": (req.parent_status or "").strip(),
        "languages": (req.languages or "").strip(),
        "strengths": (req.strengths or "").strip(),
        "weakness": (req.weakness or "").strip(),
        "nature_behavior": (req.nature_behavior or "").strip(),
        "photo_url": "",
        "observations": [],
        "created_at": datetime.utcnow(),
        "created_via": "portal",
    }
    result = collection.insert_one(doc)
    doc["_id"] = result.inserted_id

    extracted = req.extracted_name or child_name
    return {"entry": jsonable(_matched_entry(extracted, doc, "created", 100))}


@router.get("/children/{child_id}")
def child_profile(child_id: str) -> dict:
    collection = get_children_collection()
    try:
        doc = collection.find_one({"_id": ObjectId(child_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid child_id")
    if not doc:
        raise HTTPException(status_code=404, detail="Child not found")
    return jsonable(doc)


@router.patch("/children/{child_id}/profile")
def update_child_profile(child_id: str, req: UpdateProfileRequest) -> dict:
    """Partial update of a child's basic profile fields (gender, class, etc.)."""
    collection = get_children_collection()
    try:
        oid = ObjectId(child_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid child_id")

    safe = {k: v for k, v in req.fields.items() if k in _PROFILE_EDITABLE_FIELDS}
    if not safe:
        raise HTTPException(status_code=400, detail="No valid fields to update.")

    result = collection.update_one({"_id": oid}, {"$set": safe})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Child not found")
    return {"modified": result.modified_count, "message": "Profile updated."}


@router.get("/uploads/{filename}")
def serve_upload(filename: str):
    """Retrieve and serve image binary data from munmeet_uploads by filename."""
    doc = get_upload_by_filename(filename)
    if doc and "data" in doc:
        content_type = doc.get("contentType", "image/jpeg")
        return Response(content=doc["data"], media_type=content_type)

    import urllib.request
    from urllib.error import HTTPError
    bucket_name = "munmeet-media-sanket-7b724"
    folders = ["profiles", "photos"]
    gcs_data = None

    for folder in folders:
        url = f"https://storage.googleapis.com/{bucket_name}/{folder}/{filename}"
        try:
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req) as response:
                gcs_data = response.read()
                break
        except HTTPError:
            continue
        except Exception:
            continue

    if gcs_data:
        ext = filename.split(".")[-1].lower()
        content_type = "image/png" if ext == "png" else "image/jpeg"
        return Response(content=gcs_data, media_type=content_type)

    import boto3
    from botocore.client import Config
    purestore_endpoint = "https://s3.in-west3.purestore.io"
    purestore_bucket = "playground"
    purestore_key_id = "ef0de8f471eb6180DYIV"
    purestore_secret = "b9khTmQ218DSPkHRGAeEaLnDEyoUMtJa4Bt8TzPL"

    s3 = boto3.client(
        's3',
        endpoint_url=purestore_endpoint,
        aws_access_key_id=purestore_key_id,
        aws_secret_access_key=purestore_secret,
        config=Config(signature_version='s3v4')
    )

    for folder in folders:
        key = f"{folder}/{filename}"
        try:
            response = s3.get_object(Bucket=purestore_bucket, Key=key)
            data = response['Body'].read()
            content_type = response.get('ContentType', 'image/jpeg')
            return Response(content=data, media_type=content_type)
        except Exception:
            continue

    raise HTTPException(status_code=404, detail="File not found in MongoDB, GCS, or PureStore")


@router.get("/purestore/{folder}/{filename}")
def serve_purestore_file(folder: str, filename: str):
    """Retrieve and serve image binary data directly from PureStore."""
    import boto3
    from botocore.client import Config

    purestore_endpoint = "https://s3.in-west3.purestore.io"
    purestore_bucket = "playground"
    purestore_key_id = "ef0de8f471eb6180DYIV"
    purestore_secret = "b9khTmQ218DSPkHRGAeEaLnDEyoUMtJa4Bt8TzPL"

    key = f"{folder}/{filename}"
    s3 = boto3.client(
        's3',
        endpoint_url=purestore_endpoint,
        aws_access_key_id=purestore_key_id,
        aws_secret_access_key=purestore_secret,
        config=Config(signature_version='s3v4')
    )
    try:
        response = s3.get_object(Bucket=purestore_bucket, Key=key)
        data = response['Body'].read()
        content_type = response.get('ContentType', 'image/jpeg')
        return Response(content=data, media_type=content_type)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"PureStore file not found: {exc}")


@router.get("/children/{child_id}/observations")
def child_observations(child_id: str) -> list[dict]:
    try:
        oid = ObjectId(child_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid child_id")
    return [jsonable(o) for o in get_child_observations_history(oid)]


@router.get("/reports/{report_hash}")
def report_raw(report_hash: str, center_name: Optional[str] = None) -> dict:
    """Return original raw report text stored in reports registry."""
    reports = get_reports_collection()
    query: dict = {"report_hash": report_hash}
    if center_name:
        query["center_name"] = center_name
    doc = reports.find_one(query)
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found in registry")
    raw = doc.get("raw_report") or ""
    return {
        "report_title": doc.get("report_title", "Untitled Report"),
        "report_date": doc.get("report_date", ""),
        "center_name": doc.get("center_name", ""),
        "coaches": doc.get("coaches") or [],
        "raw_report": raw,
        "has_raw": bool(raw.strip()),
    }


@router.patch("/children/{child_id}/observations")
def patch_observation(child_id: str, req: UpdateObservationRequest) -> dict:
    """Partially update a single stored observation."""
    collection = get_children_collection()
    try:
        oid = ObjectId(child_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid child_id")

    invalid = set(req.fields) - EDITABLE_OBS_FIELDS
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Non-editable field(s): {', '.join(sorted(invalid))}. "
                   f"Allowed: {', '.join(sorted(EDITABLE_OBS_FIELDS))}",
        )
    if not req.fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    if req.report_hash:
        array_filter: dict = {"elem.report_hash": req.report_hash}
    elif req.date or req.reportTitle:
        array_filter = {}
        if req.date:
            try:
                array_filter["elem.date"] = datetime.fromisoformat(
                    req.date.replace("Z", "+00:00")
                )
            except ValueError:
                array_filter["elem.date"] = req.date
        if req.reportTitle:
            array_filter["elem.reportTitle"] = req.reportTitle
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide report_hash, or date and/or reportTitle to identify the observation.",
        )

    set_ops = {f"observations.$[elem].{k}": v for k, v in req.fields.items()}

    res = collection.update_one(
        {"_id": oid},
        {"$set": set_ops},
        array_filters=[array_filter],
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Child not found.")
    return {
        "modified": res.modified_count,
        "message": "Saved." if res.modified_count else "No change (values already match).",
    }


@router.delete("/children/{child_id}/observations")
def delete_observation(child_id: str, req: DeleteObservationRequest) -> dict:
    collection = get_children_collection()
    try:
        oid = ObjectId(child_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid child_id")

    pull_filter: dict = {}
    if req.reportTitle is not None:
        pull_filter["reportTitle"] = req.reportTitle
    if req.date:
        parsed = None
        try:
            parsed = datetime.fromisoformat(req.date.replace("Z", "+00:00"))
        except ValueError:
            parsed = None
        if parsed is not None:
            pull_filter["date"] = parsed
    if not pull_filter:
        raise HTTPException(status_code=400, detail="Nothing to match for deletion")

    if req.scope == "all":
        res = collection.update_many({}, {"$pull": {"observations": pull_filter}})
        return {"scope": "all", "modified": res.modified_count}
    res = collection.update_one({"_id": oid}, {"$pull": {"observations": pull_filter}})
    return {"scope": "single", "modified": res.modified_count}


@router.patch("/children/{child_id}/risk-profile")
def update_risk_profile(child_id: str, req: UpdateRiskProfileRequest) -> dict:
    """Manually update risk category, psychologist review tag, or anger increasing tag."""
    try:
        oid = ObjectId(child_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid child_id")
    
    updates = {}
    if req.risk_category is not None:
        updates["risk_category"] = req.risk_category
        updates["trauma_category"] = req.risk_category
    if req.needs_psychologist_review is not None:
        updates["needs_psychologist_review"] = req.needs_psychologist_review
    if req.anger_increasing is not None:
        updates["anger_increasing"] = req.anger_increasing
    
    ok = update_child_risk_profile(oid, updates)
    if not ok and not updates:
        raise HTTPException(status_code=400, detail="No valid update fields provided")
    return {"ok": True, "child_id": child_id, "updated": updates}


@router.post("/children/{child_id}/toggle-task")
def api_toggle_child_task(child_id: str, payload: ToggleTaskRequest) -> dict:
    """Toggles completion status for a specific task of a child."""
    success = toggle_child_task_completion(child_id, payload.task, payload.completed)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to update task status in database")
    return {
        "success": True,
        "child_id": child_id,
        "task": payload.task,
        "completed": payload.completed,
    }


@router.post("/children/{child_id}/add-observation")
def add_child_quick_observation(child_id: str, req: QuickObservationRequest) -> dict:
    """Appends a new observation report directly to a child's record in MongoDB."""
    collection = get_children_collection()
    try:
        oid = ObjectId(child_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid child_id")

    child = collection.find_one({"_id": oid})
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")

    obs_date = req.date or datetime.utcnow().strftime("%Y-%m-%d")
    report_title = req.report_title or f"Follow-up Assessment ({obs_date})"

    new_obs = {
        "date": obs_date,
        "reportTitle": report_title,
        "observations": req.observations.strip(),
        "actionItems": [item.strip() for item in req.action_items if item.strip()] if req.action_items else [],
        "coachesInvolved": req.coaches_involved or ["Psychologist / Social Worker"],
    }

    update_doc = {"$push": {"observations": new_obs}}
    if req.risk_category:
        update_doc["$set"] = {"risk_category": req.risk_category}

    collection.update_one({"_id": oid}, update_doc)

    return {
        "success": True,
        "message": f"Successfully added observation for {child.get('child_name')}",
        "child_id": child_id,
        "observation": new_obs,
    }
