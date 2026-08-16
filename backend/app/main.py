"""
FastAPI entrypoint — Phase 1 of the DataHub → Python migration (dashboard
creation only; see /docs or the migration plan for what's still on Next.js).

Run from backend/: uvicorn app.main:app --reload --port 8000

Intended to sit behind Next.js rewrites (see next.config.ts) so the browser
calls same-origin and the ct_session/ct_workspace cookies pass through
untouched — CORS middleware below is a fallback for direct (non-proxied)
access during development/testing only.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import dashboards, models, widgets

app = FastAPI(title="DataHub API (Python) — Phase 1: Dashboard Creation")

frontend_origin = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(models.router)
app.include_router(dashboards.router)
app.include_router(widgets.router)


@app.get("/health")
def health():
    return {"ok": True}
