"""
routers/centers.py
------------------
APIRouter for health check, center roster listing, child search autocomplete, and batch gender inference.
"""

from __future__ import annotations

import json
import re
from typing import Optional
from bson import ObjectId

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from common import jsonable
from db import (
    get_all_centers,
    get_children_by_balgruha,
    get_center_children_for_matching_by_name,
    get_children_collection,
    ping_db,
)
from pipeline import _fuzzy_score, _get_llm

router = APIRouter(prefix="/api", tags=["Centers"])


class InferGendersRequest(BaseModel):
    names: list[str]                # display names to classify
    child_ids: list[str] = []       # optional: parallel list of DB _ids to persist result


_GENDER_PROMPT = """\
You are an expert in Indian names. Given the list of names below, classify each name as "male", "female", or "unknown".
Many of these children are from Maharashtra, so use knowledge of Marathi, Hindi, and other Indian names.

Return ONLY a JSON array (no markdown, no explanation) where each element is exactly one of: "male", "female", or "unknown".
The array must be the same length and in the same order as the input names.

Names:
{names}

JSON array:"""


@router.get("/health")
def health() -> dict:
    return {
        "mongo": ping_db(),
    }


@router.get("/centers")
def centers() -> list[dict]:
    return [{"id": str(c["_id"]), "name": c.get("name", "")} for c in get_all_centers()]


@router.get("/centers/{name}/roster")
def roster(name: str) -> dict:
    """Children for a balgruha + aggregate stats (for the Insights tab)."""
    kids = get_children_by_balgruha(name)
    total_obs = 0
    coaches: set[str] = set()
    for k in kids:
        obs = k.get("observations") or []
        if isinstance(obs, list):
            total_obs += len(obs)
            for o in obs:
                inv = o.get("coachesInvolved") if isinstance(o, dict) else None
                if isinstance(inv, list):
                    coaches.update(str(c) for c in inv if c)
                elif isinstance(inv, str) and inv.strip():
                    coaches.add(inv.strip())
    return {
        "children": [jsonable(k) for k in kids],
        "stats": {
            "total_children": len(kids),
            "total_observations": total_obs,
            "active_coaches": len(coaches),
        },
    }


@router.get("/centers/{name}/search")
def search_children(name: str, q: str = "", limit: int = 8) -> list[dict]:
    """
    Lightweight autocomplete over a center's roster.
    Combines substring matches (ranked first) with fuzzy scores so the
    review screen can offer live suggestions while the user types.
    """
    q = q.strip()
    if not q:
        return []
    roster_list = get_center_children_for_matching_by_name(name)
    q_lower = q.lower()
    results: list[dict] = []
    for doc in roster_list:
        child_name = doc.get("child_name", "") or ""
        if not child_name:
            continue
        substring = q_lower in child_name.lower()
        score = _fuzzy_score(q, child_name)
        if substring or score >= 55:
            results.append(
                {
                    "child_name": child_name,
                    "db_id": str(doc["_id"]),
                    "score": 100 if child_name.lower() == q_lower else int(score),
                    "substring": substring,
                    "class_studying": doc.get("class_studying", "") or "",
                }
            )
    results.sort(key=lambda r: (not r["substring"], -r["score"], r["child_name"]))
    for r in results:
        r.pop("substring", None)
    return results[: max(1, min(limit, 25))]


@router.post("/infer-genders")
def infer_genders(req: InferGendersRequest) -> dict:
    """
    Use Gemini to infer gender from a list of Indian child names in a single
    batch call. Optionally persists the result back to MongoDB.
    """
    if not req.names:
        return {"genders": []}

    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser

    names_text = "\n".join(f"{i+1}. {n}" for i, n in enumerate(req.names))
    prompt = ChatPromptTemplate.from_template(_GENDER_PROMPT)
    chain = prompt | _get_llm() | StrOutputParser()

    try:
        raw = chain.invoke({"names": names_text}).strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        raw = raw.strip()
        genders_raw = json.loads(raw)
        if not isinstance(genders_raw, list):
            raise ValueError("Expected a JSON array")
        valid = {"male", "female", "unknown"}
        genders: list[str] = []
        for g in genders_raw:
            val = str(g).strip().lower()
            genders.append(val if val in valid else "unknown")
        while len(genders) < len(req.names):
            genders.append("unknown")
        genders = genders[: len(req.names)]
    except Exception:
        genders = ["unknown"] * len(req.names)

    if req.child_ids and len(req.child_ids) == len(req.names):
        col = get_children_collection()
        for child_id_str, gender in zip(req.child_ids, genders):
            if gender == "unknown":
                continue
            try:
                col.update_one(
                    {"_id": ObjectId(child_id_str)},
                    {"$set": {"gender": gender}},
                )
            except Exception:
                pass

    return {"genders": genders}
