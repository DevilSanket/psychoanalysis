---
title: ISF Psycho Analysis Portal
emoji: 🧠
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# ISF Child Psycho-Analysis Portal
React Web Portal with FastAPI backend for parsing field reports, extracting child profiles with Gemini, and matching/updating MongoDB profiles.

## IIS Publish Guide

This repository is designed to run as a static React app served by IIS, with `/api/*` proxied to a FastAPI backend running locally on port `8000`.

### Summary of the approach

- Frontend: build with `npm run build` inside `frontend/`, producing `frontend/dist/`.
- Backend: run `uvicorn api:app --host 127.0.0.1 --port 8000` as a Windows Service.
- IIS: serve `frontend/dist/` as the site root and proxy `/api/*` requests to `127.0.0.1:8000`.
- `frontend/dist/web.config` is already included and handles SPA routing plus proxying of `/api/*`.

### Quick version

1. Build frontend:
   - `cd frontend && npm run build`
2. Create a Python virtual environment and install requirements:
   - `python -m venv .venv`
   - `.venv\Scripts\python.exe -m pip install --upgrade pip`
   - `.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-api.txt`
3. Create a Windows Service for Uvicorn using NSSM:
   - `nssm install ISF-API .venv\Scripts\uvicorn.exe`
   - Set AppParameters to `api:app --host 127.0.0.1 --port 8000`
   - Set AppDirectory to the project root
   - Configure `AppEnvironmentExtra` with values from `.env`
4. Install IIS modules from `https://www.iis.net/downloads/microsoft`:
   - URL Rewrite 2.1
   - Application Request Routing (ARR) 3.0
5. Enable ARR proxying in IIS Manager at the server level.
6. Create or update an IIS site pointing to `frontend/dist/`.
7. If using a hostname, set `ALLOWED_ORIGIN` in `.env` to your public origin, for example:
   - `ALLOWED_ORIGIN=http://myserver.example.com`

### Important notes

- The backend already allows local origins and supports a custom production origin via `ALLOWED_ORIGIN`.
- `frontend/dist/web.config` includes rules to proxy `/api/*` to `http://127.0.0.1:8000`, serve hashed static assets, and rewrite unknown routes to `index.html` for SPA navigation.
- The common gotcha is forgetting to enable ARR proxy at the server level in IIS Manager.

### Existing helper scripts

- `deploy_vps.ps1` prepares the IIS site, enables ARR proxy if available, installs dependencies, and registers the `ISF-API` Windows Service via NSSM.
- `update_vps.ps1` rebuilds the frontend, updates Python dependencies, and restarts the backend service.

### CORS configuration

In `api.py`, the backend uses `CORSMiddleware` with a default allowlist for local development and IIS on port 80. Production hostnames should be added by setting `ALLOWED_ORIGIN` in the environment.
