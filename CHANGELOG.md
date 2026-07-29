# 📜 Changelog — ISF Child Psycho-Analysis & Balgruha Portal

All notable changes, bug fixes, and feature releases for the **Initiative Seva Foundation (ISF) Child Psycho-Analysis & Balgruha Management System** are documented in this file.

---

## 🚀 [v1.4.0] — Task Completion & Dashboard Unification (2026-07-30)

### 🆕 New Features
- **Interactive Task Toggling (Mark Complete / Re-open)**:
  - Added checkboxes (`☐` / `☑️`) across **Task Analytics** and **Child Profile & Observation History** views (`TaskAnalytics.tsx`, `RosterInsights.tsx`).
  - Social workers and admins can mark pending action items as completed or re-open them directly from the UI with real-time MongoDB synchronization.
  - Completed tasks are styled with a strike-through text decoration (`~~Task~~`) and green `✅ Completed` status badge.
- **Task Status Filter Tabs**:
  - Added status filtering buttons (**All Tasks**, **⏳ Pending**, **✅ Completed**) in **Task Analytics** for instant filtering.
- **Unified Progress Dashboards in Evaluation / InnerMap**:
  - Integrated all 5 progress analytics modules into **Evaluation / InnerMap** (`RosterInsights.tsx`) as interactive sub-tabs:
    - 📂 **Child Directory & History**
    - 🔴 **Risk Dashboard**
    - 🚨 **Falling Through Cracks**
    - 🗺️ **Balgruha Heat Map**
    - 📊 **Task Analytics**
    - 🌟 **Success Stories**
  - Enabled 1-click cross-navigation from any dashboard table row straight into the child's profile roster.

### 🛠️ Backend & API Updates
- **API Endpoint (`POST /api/children/{child_id}/toggle-task`)**:
  - Created `ToggleTaskRequest` model and backend API route in `api.py`.
- **MongoDB Persistence (`db.py`)**:
  - Added `toggle_child_task_completion()` helper using regex matching to prepend/remove `[COMPLETED]` prefix in `observations[].actionItems` without string duplication (`db.py`).
  - Updated `get_pending_task_analytics()` metrics calculation to count completed tasks separately from active pending and overdue metrics.

### 🐛 Bug Fixes
- **Highest Risk Balgruha Metric Calculation**:
  - Fixed tie-breaker logic in `get_balgruha_risk_heatmap()` (`db.py`). Previously, when `high_risk` count was 0 across all Balgruhas, MongoDB sorted by total children count and falsely named the largest Balgruha (*Sahyadri Manchar*) as "Highest Risk". The system now correctly returns `"None"` when 0 high-risk cases exist.
- **Cross-Browser Checkbox Rendering**:
  - Replaced native HTML `<input type="checkbox">` elements with **Material Symbols Icon Checkbox Buttons** (`check_box` / `check_box_outline_blank`) to prevent OS/browser theme rules from hiding checkmarks.

### 🧹 Cleanup & Simplifications
- **Trauma Filter Removal**:
  - Removed trauma filter dropdown from **Child Directory & History** per user directive to simplify roster navigation.
- **LangSmith Tracing Removal**:
  - Cleaned up optional `LANGCHAIN_TRACING_V2` environment variables from `.env` and `.env.example`, and removed the LangSmith status badge from the header navigation bar (`App.tsx`).

---

## 📦 [v1.0.0] — Initial Core Release (2026-07-30)

### 🌟 Core Capabilities
- **LangGraph & Gemini Unstructured Extraction Pipeline**:
  - 2-node graph (`extractor_node` ➔ `saver_node`) extracting child identity, behavioral traits, psychological observations, risk category, and action items from raw field notes.
  - Fallback logic from `gemini-2.5-pro` to `gemini-2.5-flash`.
- **FastAPI REST API**:
  - Full CRUD operations for Balgruha centers, children profiles, observations, and audio transcription uploads.
- **MongoDB Atlas Integration**:
  - Flexible schema handling `munmeet_children` and `unmatched_queue` collections with automated database indexing.
- **Interactive React + TypeScript UI**:
  - Modern UI styled with custom CSS variables, Material Symbols, glassmorphism, responsive data grids, audio recording / live transcription, and toast notifications.
- **IIS Deployment & Service Scripts**:
  - PowerShell deployment automation (`deploy_vps.ps1`, `update_vps.ps1`) for IIS reverse proxy and NSSM Windows Service process management.

---

## 🔗 Repository Information
- **GitHub Repository**: [https://github.com/DevilSanket/psychoanalysis](https://github.com/DevilSanket/psychoanalysis)
- **Branch**: `main`
