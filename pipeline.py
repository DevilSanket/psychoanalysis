"""
pipeline.py
-----------
LangGraph pipeline for the Field Report Parser.

Extraction graph - 2 nodes:

  START
    -> [Node 1] extract_all       gemini-3.1-pro: single call extracts all children
                                  with name, generalBackground, psychologicalNotes,
                                  and actionItems in one structured JSON response
    -> [Node 2] match_children    MongoDB: resolve names to ObjectIds (fuzzy + exact)
    -> END

Save graph:
  START -> save_to_db -> END

Performance:
  1 LLM call total (regardless of number of children)
  ~3-6 seconds end-to-end
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any

from bson import ObjectId
from dotenv import load_dotenv
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph

from db import get_children_collection, get_coach_ids_by_names
from models import PipelineState

load_dotenv()

# ---------------------------------------------------------------------------
# Model Configurations (Primary & Secondary Fallback)
# ---------------------------------------------------------------------------

_PRIMARY_MODEL = os.getenv("GEMINI_PRIMARY_MODEL", "gemini-3.1-pro-preview")
_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-flash-latest")


def _get_llm(model_name: str | None = None) -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise EnvironmentError("GOOGLE_API_KEY is not set in your .env file.")
    target_model = model_name or _PRIMARY_MODEL
    return ChatGoogleGenerativeAI(
        model=target_model,
        temperature=0,
        google_api_key=api_key,
    )


# ---------------------------------------------------------------------------
# Prompt - single call, all children, all fields
# ---------------------------------------------------------------------------

EXTRACT_ALL_PROMPT = """\
You are a child welfare analyst reviewing a field report from a social worker or coach.

Your task: Read the report and extract the metadata of the report as well as the observations for EVERY child mentioned in the report.

Return a single JSON object with EXACTLY the following structure:
{{
  "center_name": "<the name of the center, balgruha, or home visited or mentioned in the report, e.g. Mauli Balakashram Wadebolhai - empty string if not mentioned>",
  "report_title": "<a descriptive short title for this report, e.g. June Site Visit - empty string if not mentioned>",
  "report_date": "<the date of the visit or report in YYYY-MM-DD format - empty string if not mentioned>",
  "coaches": ["<names of any coaches, social workers, or psychologists involved in the visit/report>"],
  "children": [
    {{
      "name": "<full name of the child exactly as written in the report>",
      "generalBackground": "<family situation, socioeconomic context, living arrangements, relevant history, relationships with family members - empty string if not mentioned>",
      "psychologistName": "<name of the psychologist or assessor conducting the session or mentioned in the report - empty string if not mentioned>",
      "testsDone": "<any psychological tests, assessments, games, or structured activities conducted during this visit/session - empty string if not mentioned>",
      "observations": "<detailed psychological and behavioral observations, emotional state, behavioral patterns, mental health indicators, mood, social interaction, psychological concerns - empty string if not mentioned>",
      "followUp": "<follow up details, status, or notes from the previous session/observation - empty string if not mentioned>",
      "actionItems": ["<specific actionable follow-up task for this child>"],
      "risk_category": "<classify child risk tier based on observations into EXACTLY ONE of: 'high_risk' (severe distress/trauma/self-harm/abuse/anger), 'trauma_unprocessed' (grief/abandonment/loss/unresolved past trauma), 'identity_formation' (adolescent identity/behavioral guidance), 'well_adjusted' (stable/healthy progress) - default to 'not_yet_screened' if unclear>"
    }}
  ]
}}

RULES:
- Include EVERY child / minor mentioned - do NOT include coaches, staff, or adults in the children array.
- Use the child name exactly as it appears in the report.
- actionItems must be a JSON array of strings. Use [] if none mentioned.
- All other fields are strings. Use "" if nothing relevant is mentioned.
- Return ONLY the JSON object - no markdown, no code fences, no explanation.

--- BEGIN REPORT ---
{report_text}
--- END REPORT ---

JSON object:\
"""



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_report_json(raw: str) -> tuple[dict, list[dict]]:
    """Parse the JSON object returned by the LLM, stripping markdown fences and cleaning common errors."""
    raw = raw.strip()
    # Strip markdown backticks
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()
    
    # Slice raw to get only the JSON object structure if conversational text leaked
    start = raw.find('{')
    end = raw.rfind('}')
    if start != -1 and end != -1 and end > start:
        raw = raw[start:end+1]
    elif raw.startswith('['):
        # Fallback to check if it's an array directly
        start_arr = raw.find('[')
        end_arr = raw.rfind(']')
        if start_arr != -1 and end_arr != -1 and end_arr > start_arr:
            raw = raw[start_arr:end_arr+1]
        
    # Clean up trailing commas in lists or objects
    raw = re.sub(r',\s*([\]}])', r'\1', raw)
    
    metadata = {
        "center_name": "",
        "report_title": "",
        "report_date": "",
        "coaches": []
    }
    children = []
    
    try:
        data = json.loads(raw)
        raw_children = []
        if isinstance(data, list):
            raw_children = data
        elif isinstance(data, dict):
            metadata["center_name"] = str(data.get("center_name", "")).strip()
            metadata["report_title"] = str(data.get("report_title", "")).strip()
            metadata["report_date"] = str(data.get("report_date", "")).strip()
            coaches = data.get("coaches", [])
            if isinstance(coaches, list):
                metadata["coaches"] = [str(c).strip() for c in coaches if str(c).strip()]
            raw_children = data.get("children", [])
            
        if isinstance(raw_children, list):
            for item in raw_children:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name", "")).strip()
                if not name:
                    continue
                action_items = item.get("actionItems", [])
                if not isinstance(action_items, list):
                    action_items = []
                children.append({
                    "name":               name,
                    "generalBackground":  str(item.get("generalBackground", "")).strip(),
                    "psychologistName":   str(item.get("psychologistName", "")).strip(),
                    "testsDone":          str(item.get("testsDone", "")).strip(),
                    "observations":       str(item.get("observations", "")).strip(),
                    "followUp":           str(item.get("followUp", "")).strip(),
                    "psychologicalNotes": str(item.get("observations", "") or item.get("psychologicalNotes", "")).strip(),
                    "actionItems":        [str(a).strip() for a in action_items if str(a).strip()],
                    "risk_category":      str(item.get("risk_category", "")).strip(),
                })
    except Exception:
        pass
        
    return metadata, children



# ---------------------------------------------------------------------------
# Fuzzy matching helpers
# ---------------------------------------------------------------------------

try:
    from rapidfuzz import fuzz as _fuzz
    from rapidfuzz import process as _fuzz_process

    def _fuzzy_score(query: str, candidate: str) -> int:
        return max(
            _fuzz.token_sort_ratio(query, candidate),
            _fuzz.partial_ratio(query, candidate),
        )

    def _fuzzy_best_match(
        query: str, candidates: list[dict]
    ) -> tuple[dict | None, int]:
        if not candidates:
            return None, 0
        names = [d.get("child_name", "") for d in candidates]
        result = _fuzz_process.extractOne(
            query, names, scorer=_fuzz.token_sort_ratio,
        )
        if result is None:
            return None, 0
        _, score, idx = result
        combined = _fuzzy_score(query, names[idx])
        return candidates[idx], max(int(score), combined)

except ImportError:
    from difflib import SequenceMatcher

    def _fuzzy_score(query: str, candidate: str) -> int:  # type: ignore[misc]
        return int(SequenceMatcher(None, query.lower(), candidate.lower()).ratio() * 100)

    def _fuzzy_best_match(  # type: ignore[misc]
        query: str, candidates: list[dict]
    ) -> tuple[dict | None, int]:
        best_doc, best_score = None, 0
        for d in candidates:
            s = _fuzzy_score(query, d.get("child_name", ""))
            if s > best_score:
                best_score, best_doc = s, d
        return best_doc, best_score


_SCORE_HIGH   = 85
_SCORE_MEDIUM = 70


def _confidence(score: int) -> str:
    if score >= _SCORE_HIGH:
        return "high"
    if score >= _SCORE_MEDIUM:
        return "medium"
    return "low"


def _doc_to_profile(doc: dict) -> dict:
    return {
        "photo_url":       doc.get("photo_url", ""),
        "class_studying":  doc.get("class_studying", ""),
        "school":          doc.get("school", ""),
        "dob":             str(doc.get("dob", "")),
        "parent_status":   doc.get("parent_status", ""),
        "languages":       doc.get("languages", ""),
        "strengths":       doc.get("strengths", ""),
        "weakness":        doc.get("weakness", ""),
        "nature_behavior": doc.get("nature_behavior") or doc.get("nature", ""),
        "balgruha_name":   doc.get("balgruha_name", ""),
    }


def _matched_entry(extracted: Any, doc: dict, match_type: str, score: int) -> dict:
    name_val = extracted if isinstance(extracted, str) else extracted.get("name", "")
    bg_val = "" if isinstance(extracted, str) else extracted.get("generalBackground", "")
    psychologist_name_val = "" if isinstance(extracted, str) else extracted.get("psychologistName", "")
    tests_done_val = "" if isinstance(extracted, str) else extracted.get("testsDone", "")
    obs_val = "" if isinstance(extracted, str) else extracted.get("observations", "")
    follow_up_val = "" if isinstance(extracted, str) else extracted.get("followUp", "")
    psych_val = "" if isinstance(extracted, str) else extracted.get("psychologicalNotes", "")
    actions_val = [] if isinstance(extracted, str) else extracted.get("actionItems", [])
    
    return {
        "name":               name_val,
        "db_id":              str(doc["_id"]),
        "db_name":            doc.get("child_name"),
        "center_id":          str(doc.get("center_id", "")),
        "matched":            True,
        "match_type":         match_type,
        "match_score":        score,
        "profile":            _doc_to_profile(doc),
        "generalBackground":  bg_val,
        "psychologistName":   psychologist_name_val,
        "testsDone":          tests_done_val,
        "observations":       obs_val,
        "followUp":           follow_up_val,
        "psychologicalNotes": psych_val,
        "actionItems":        actions_val,
    }


def _unmatched_entry(extracted: Any, center_id_str: str | None, score: int) -> dict:
    name_val = extracted if isinstance(extracted, str) else extracted.get("name", "")
    bg_val = "" if isinstance(extracted, str) else extracted.get("generalBackground", "")
    psychologist_name_val = "" if isinstance(extracted, str) else extracted.get("psychologistName", "")
    tests_done_val = "" if isinstance(extracted, str) else extracted.get("testsDone", "")
    obs_val = "" if isinstance(extracted, str) else extracted.get("observations", "")
    follow_up_val = "" if isinstance(extracted, str) else extracted.get("followUp", "")
    psych_val = "" if isinstance(extracted, str) else extracted.get("psychologicalNotes", "")
    actions_val = [] if isinstance(extracted, str) else extracted.get("actionItems", [])
    
    return {
        "name":               name_val,
        "db_id":              None,
        "db_name":            None,
        "center_id":          center_id_str,
        "matched":            False,
        "match_type":         "none",
        "match_score":        score,
        "profile":            {},
        "generalBackground":  bg_val,
        "psychologistName":   psychologist_name_val,
        "testsDone":          tests_done_val,
        "observations":       obs_val,
        "followUp":           follow_up_val,
        "psychologicalNotes": psych_val,
        "actionItems":        actions_val,
    }


# ---------------------------------------------------------------------------
# Node 1 - Extract Everything (single Gemini Pro call)
# ---------------------------------------------------------------------------

def extract_all_node(state: PipelineState) -> dict[str, Any]:
    """
    Primary gemini-3.1-pro-preview call with automatic fallback to gemini-flash-latest:
    reads the full report and returns a structured JSON object with metadata and children list.
    """
    prompt = ChatPromptTemplate.from_template(EXTRACT_ALL_PROMPT)
    primary_chain = prompt | _get_llm(_PRIMARY_MODEL) | StrOutputParser()

    try:
        try:
            raw = primary_chain.invoke({"report_text": state["raw_report"]})
        except Exception as primary_err:
            print(f"⚠️ Primary LLM ({_PRIMARY_MODEL}) failed: {primary_err}. Retrying with fallback model ({_FALLBACK_MODEL})...")
            fallback_chain = prompt | _get_llm(_FALLBACK_MODEL) | StrOutputParser()
            raw = fallback_chain.invoke({"report_text": state["raw_report"]})

        metadata, children = _parse_report_json(raw)

        if not children:
            return {
                "identified_names":    [],
                "_extracted_children": [],
                "matched_children":    [],
                "error": "No children found in the report.",
            }

        # Prefill metadata in state if not already set or if empty
        updated = {
            "identified_names":    [c["name"] for c in children],
            "_extracted_children": children,
            "error": None,
        }
        
        # If the input has empty metadata, populate them from the AI extraction
        if not state.get("report_title") or state.get("report_title") == "Untitled Report":
            updated["report_title"] = metadata.get("report_title") or "Untitled Report"
        if not state.get("report_date"):
            updated["report_date"] = metadata.get("report_date") or datetime.utcnow().strftime("%Y-%m-%d")
        if not state.get("coaches"):
            updated["coaches"] = metadata.get("coaches") or []
            
        updated["_extracted_center_name"] = metadata.get("center_name") or ""
        return updated

    except Exception as exc:
        return {
            "identified_names":    [],
            "_extracted_children": [],
            "matched_children":    [],
            "error": f"Extraction failed: {exc}",
        }


# ---------------------------------------------------------------------------
# Node 2 - Match Children to MongoDB  (exact -> fuzzy fallback)
# ---------------------------------------------------------------------------

def match_children_node(state: PipelineState) -> dict[str, Any]:
    """
    For each extracted child, attempt exact then fuzzy match against MongoDB.
    Carries the AI-extracted observation fields into the matched entry so
    they appear pre-filled in the Review step.
    Unmatched children are auto-inserted into munmeet_unmatched_children
    for admin review.
    """
    from db import get_center_children_for_matching_by_name, get_unmatched_collection

    center_id_str   = state.get("selected_center_id")
    center_name     = state.get("selected_center_name")
    
    extracted_center = state.get("_extracted_center_name") or ""
    if not center_name and extracted_center:
        # Match against centers in DB!
        from db import get_all_centers
        db_centers = get_all_centers()
        names = [c["name"] for c in db_centers]
        if names:
            from rapidfuzz import process, fuzz
            match = process.extractOne(extracted_center, names, scorer=fuzz.token_sort_ratio)
            if match and match[1] >= 60:
                center_name = match[0]
                for c in db_centers:
                    if c["name"] == center_name:
                        center_id_str = str(c["_id"])
                        break

    report_title    = state.get("report_title", "Untitled Report")
    report_date     = state.get("report_date", "")
    coaches         = state.get("coaches", [])
    
    # Reliable join: scope by balgruha_name (== center name)
    center_children = (
        get_center_children_for_matching_by_name(center_name) if center_name else []
    )

    collection = get_children_collection()
    matched: list[dict] = []
    unmatched_queue = get_unmatched_collection()

    extracted_children: list[dict] = state.get("_extracted_children") or []

    for extracted in extracted_children:
        name_stripped = extracted["name"].strip()

        # Compute all fuzzy candidates sorted by score
        top_candidates = []
        if center_children:
            scored = []
            for d in center_children:
                s = _fuzzy_score(name_stripped, d.get("child_name", ""))
                scored.append((d, s))
            scored.sort(key=lambda x: x[1], reverse=True)
            top_candidates = [
                {"db_id": str(c[0]["_id"]), "child_name": c[0]["child_name"], "score": c[1]}
                for c in scored if c[1] >= 50
            ][:5]

        # Stage 1: exact regex match, scoped by balgruha_name
        pattern = re.compile(re.escape(name_stripped), re.IGNORECASE)
        query: dict = {"child_name": pattern}
        if center_name:
            query["balgruha_name"] = center_name
        doc = collection.find_one(query)

        if doc:
            entry = _matched_entry(extracted, doc, "exact", 100)
            entry["candidates"] = top_candidates
            matched.append(entry)
            continue

        # Stage 2: fuzzy against center roster
        if center_children:
            best_doc, score = _fuzzy_best_match(name_stripped, center_children)
            conf = _confidence(score)
            if best_doc and conf in ("high", "medium"):
                entry = _matched_entry(extracted, best_doc, conf, score)
            else:
                entry = _unmatched_entry(extracted, center_id_str, score)
            entry["candidates"] = top_candidates
            matched.append(entry)
        else:
            entry = _unmatched_entry(extracted, center_id_str, 0)
            entry["candidates"] = []
            matched.append(entry)

    # Auto-insert unmatched children into the admin queue
    for entry in matched:
        if entry["matched"]:
            continue
        if not center_name:
            continue
        # Upsert: don't duplicate the same name+center combination
        try:
            unmatched_queue.update_one(
                {"extracted_name": entry["name"], "balgruha_name": center_name},
                {
                    "$set": {
                        "extracted_name": entry["name"],
                        "balgruha_name": center_name,
                        "report_title": report_title,
                        "report_date": report_date,
                        "coaches": coaches,
                        "generalBackground": entry.get("generalBackground", ""),
                        "psychologicalNotes": entry.get("psychologicalNotes", ""),
                        "psychologistName": entry.get("psychologistName", ""),
                        "testsDone": entry.get("testsDone", ""),
                        "observations": entry.get("observations", ""),
                        "followUp": entry.get("followUp", ""),
                        "actionItems": entry.get("actionItems", []),
                        "status": "pending",
                        "last_seen_at": datetime.utcnow(),
                    },
                    "$setOnInsert": {
                        "created_at": datetime.utcnow(),
                    },
                },
                upsert=True,
            )
        except Exception:
            pass

    return {
        "matched_children": matched,
        "selected_center_name": center_name,
        "selected_center_id": center_id_str,
    }



# ---------------------------------------------------------------------------
# Save Node - Push observation to MongoDB
# ---------------------------------------------------------------------------

def save_to_db_node(state: PipelineState) -> dict[str, Any]:
    """
    For every matched child, push a complete observation object into
    their munmeet_children document (observations array).
    """
    collection = get_children_collection()
    results: list[dict] = []

    report_date_str = state.get("report_date", "")
    try:
        report_date_dt = datetime.fromisoformat(report_date_str)
    except ValueError:
        report_date_dt = datetime.utcnow()

    coach_names: list[str] = state.get("coaches", [])
    coach_ids: list[ObjectId] = get_coach_ids_by_names(coach_names)

    # Prefer the selected center's real _id for the stored observation so the
    # link is consistent, falling back to the child's (possibly stale) center_id.
    selected_center_id_str = state.get("selected_center_id")

    # Duplicate prevention: fingerprint of the report this save came from.
    # Stored inside each observation and used as an atomic push guard below.
    report_hash: str | None = state.get("report_hash")
    force_save: bool = bool(state.get("force_save"))

    for child in state.get("matched_children") or []:
        action_items = child.get("actionItems", [])
        if isinstance(action_items, str):
            action_items = [s.strip() for s in action_items.split("\n") if s.strip()]

        if not child.get("matched") or not child.get("db_id"):
            center_name = state.get("selected_center_name")
            if center_name:
                from db import get_unmatched_collection
                get_unmatched_collection().update_one(
                    {"extracted_name": child["name"], "balgruha_name": center_name},
                    {
                        "$set": {
                            "report_title": state.get("report_title"),
                            "report_date": state.get("report_date"),
                            "report_hash": state.get("report_hash"),
                            "coaches": state.get("coaches"),
                            "generalBackground": child.get("generalBackground", ""),
                            "psychologicalNotes": child.get("psychologicalNotes", ""),
                            "psychologistName": child.get("psychologistName", ""),
                            "testsDone": child.get("testsDone", ""),
                            "observations": child.get("observations", ""),
                            "followUp": child.get("followUp", ""),
                            "actionItems": action_items,
                            "last_seen_at": datetime.utcnow(),
                        }
                    }
                )
            results.append(
                {"name": child["name"], "success": True, "reason": "Sent to Admin Queue"}
            )
            continue

        center_id_str = selected_center_id_str or child.get("center_id")
        center_oid    = ObjectId(center_id_str) if center_id_str else None

        observation = {
            "date":               report_date_dt,
            "reportTitle":        state.get("report_title", "Untitled Report"),
            "centerName":         state.get("selected_center_name", ""),
            "generalBackground":  child.get("generalBackground", ""),
            "psychologistName":   child.get("psychologistName", ""),
            "testsDone":          child.get("testsDone", ""),
            "observations":       child.get("observations", ""),
            "followUp":           child.get("followUp", ""),
            "psychologicalNotes": child.get("psychologicalNotes", ""),
            "actionItems":        action_items,
            "coachesInvolved":    coach_names,
            "coach_ids":          coach_ids,
            "center_id":          center_oid,
            "report_hash":        report_hash,
        }

        # Idempotent push: unless the user explicitly forced a re-save, only
        # push if this child does NOT already have an observation from the
        # same report (matched by report_hash). This is a single atomic
        # update, so concurrent/retried saves can never create duplicates.
        query: dict = {"_id": ObjectId(child["db_id"])}
        if report_hash and not force_save:
            query["observations.report_hash"] = {"$ne": report_hash}

        update_doc: dict = {"$push": {"observations": observation}}
        rc = child.get("risk_category")
        if rc and rc in ("high_risk", "trauma_unprocessed", "identity_formation", "well_adjusted", "not_yet_screened"):
            update_doc["$set"] = {"risk_category": rc}

        try:
            res = collection.update_one(query, update_doc)
            if res.modified_count > 0:
                results.append({"name": child["name"], "success": True, "reason": "OK"})
            elif res.matched_count == 0 and report_hash and not force_save:
                # The _id exists (it came from the DB), so the guard filtered
                # it out: this report was already saved for this child.
                results.append({
                    "name":    child["name"],
                    "success": False,
                    "reason":  "Skipped — an observation from this report already exists",
                })
            else:
                results.append({
                    "name":    child["name"],
                    "success": False,
                    "reason":  "Document not modified",
                })
        except Exception as exc:
            results.append(
                {"name": child["name"], "success": False, "reason": str(exc)}
            )

    return {"save_results": results}


# ---------------------------------------------------------------------------
# Graph 1 - Extraction Pipeline
# ---------------------------------------------------------------------------
#
#  START
#    -> extract_all      (gemini-3.1-pro: 1 call, all children + all fields)
#    -> match_children   (MongoDB exact + fuzzy)
#    -> END

def build_extraction_graph():
    def route_after_extract(state: PipelineState) -> str:
        if state.get("error") or not state.get("identified_names"):
            return END
        return "match_children"

    graph = StateGraph(PipelineState)
    graph.add_node("extract_all",    extract_all_node)
    graph.add_node("match_children", match_children_node)

    graph.set_entry_point("extract_all")
    graph.add_conditional_edges(
        "extract_all",
        route_after_extract,
        {END: END, "match_children": "match_children"},
    )
    graph.add_edge("match_children", END)

    return graph.compile()


# ---------------------------------------------------------------------------
# Graph 2 - Save Pipeline
# ---------------------------------------------------------------------------

def build_save_graph():
    graph = StateGraph(PipelineState)
    graph.add_node("save_to_db", save_to_db_node)
    graph.set_entry_point("save_to_db")
    graph.add_edge("save_to_db", END)
    return graph.compile()


# ---------------------------------------------------------------------------
# Compiled singletons (imported by app.py)
# ---------------------------------------------------------------------------

extraction_graph = build_extraction_graph()
save_graph       = build_save_graph()
