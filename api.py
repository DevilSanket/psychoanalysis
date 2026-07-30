"""
api.py
------
FastAPI backend for the ISF Psycho-Analysis Portal (React frontend).

Modular entrypoint importing APIRouters from `routers/`.

Run:
    uvicorn api:app --reload --port 8000
"""

from __future__ import annotations

import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

load_dotenv()

from routers import admin, ai, analytics, centers, children, extraction

app = FastAPI(title="ISF Psycho-Analysis API", version="1.0.0")

_allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://localhost",        # IIS on port 80
    "http://127.0.0.1",
]
_vps_origins = os.getenv("ALLOWED_ORIGIN", "").strip()
if _vps_origins:
    for origin in _vps_origins.split(","):
        origin_clean = origin.strip()
        if origin_clean:
            _allowed_origins.append(origin_clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(centers.router)
app.include_router(children.router)
app.include_router(extraction.router)
app.include_router(analytics.router)
app.include_router(admin.router)
app.include_router(ai.router)

# Serve Frontend Static Files (Hugging Face / Production build)
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")

    @app.exception_handler(404)
    async def custom_404_handler(request, __):
        if request.url.path.startswith("/api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        return FileResponse(os.path.join(frontend_dist, "index.html"))
