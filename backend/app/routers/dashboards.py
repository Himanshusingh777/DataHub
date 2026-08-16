"""
Port of:
  - src/app/api/dashboards/route.ts        (list, create)
  - src/app/api/dashboards/[id]/route.ts   (get, update, delete)
  - src/app/api/dashboards/[id]/share/route.ts (generate/revoke share token)
"""

import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request

from app.db import get_connection
from app.deps import AuthContext, get_auth_context

router = APIRouter(prefix="/api/v1/dashboards", tags=["dashboards"])


def _parse_dashboard(d: dict, widgets: list[dict]) -> dict:
    try:
        layout = json.loads(d["layout_json"])
    except (TypeError, ValueError):
        layout = []
    parsed_widgets = []
    for w in widgets:
        try:
            config = json.loads(w["config_json"])
        except (TypeError, ValueError):
            config = {}
        try:
            position = json.loads(w["position_json"])
        except (TypeError, ValueError):
            position = {}
        parsed_widgets.append({**w, "config": config, "position": position})
    return {**d, "layout": layout, "is_published": bool(d["is_published"]), "widgets": parsed_widgets}


@router.get("")
def list_dashboards(auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT d.*, COUNT(w.id) as widget_count
            FROM dashboards d
            LEFT JOIN widgets w ON w.dashboard_id = d.id
            WHERE d.workspace_id = ?
            GROUP BY d.id
            ORDER BY d.updated_at DESC
            """,
            (auth.workspace_id,),
        ).fetchall()
    finally:
        conn.close()
    return {"ok": True, "dashboards": [dict(r) for r in rows]}


@router.post("", status_code=201)
async def create_dashboard(request: Request, auth: AuthContext = Depends(get_auth_context)):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    description = body.get("description")
    theme = body.get("theme") or "light"

    dashboard_id = f"dsh_{uuid.uuid4().hex[:16]}"
    now = int(time.time() * 1000)

    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO dashboards (id, workspace_id, user_id, name, description, theme, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (dashboard_id, auth.workspace_id, auth.user_id, name, description, theme, now, now),
        )
        conn.commit()
        created = conn.execute("SELECT * FROM dashboards WHERE id = ?", (dashboard_id,)).fetchone()
    finally:
        conn.close()

    return {"ok": True, "dashboard": dict(created)}


@router.get("/{dashboard_id}")
def get_dashboard(dashboard_id: str, auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        dashboard = conn.execute(
            "SELECT * FROM dashboards WHERE id = ? AND workspace_id = ?", (dashboard_id, auth.workspace_id)
        ).fetchone()
        if not dashboard:
            raise HTTPException(404, "Dashboard not found")
        widgets = conn.execute(
            "SELECT * FROM widgets WHERE dashboard_id = ? AND workspace_id = ? ORDER BY created_at ASC",
            (dashboard_id, auth.workspace_id),
        ).fetchall()
    finally:
        conn.close()
    return {"ok": True, "dashboard": _parse_dashboard(dict(dashboard), [dict(w) for w in widgets])}


@router.put("/{dashboard_id}")
async def update_dashboard(dashboard_id: str, request: Request, auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM dashboards WHERE id = ? AND workspace_id = ?", (dashboard_id, auth.workspace_id)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Dashboard not found")

        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")

        now = int(time.time() * 1000)
        name = body.get("name")
        description = body.get("description")
        has_description = "description" in body
        theme = body.get("theme")
        layout = body.get("layout")
        is_published = body.get("is_published")

        conn.execute(
            """
            UPDATE dashboards SET
              name         = COALESCE(?, name),
              description  = CASE WHEN ? THEN ? ELSE description END,
              theme        = COALESCE(?, theme),
              layout_json  = COALESCE(?, layout_json),
              is_published = COALESCE(?, is_published),
              updated_at   = ?
            WHERE id = ? AND workspace_id = ?
            """,
            (
                name.strip() if isinstance(name, str) else None,
                has_description, description,
                theme,
                json.dumps(layout) if layout is not None else None,
                (1 if is_published else 0) if is_published is not None else None,
                now,
                dashboard_id, auth.workspace_id,
            ),
        )
        conn.commit()

        updated = conn.execute("SELECT * FROM dashboards WHERE id = ?", (dashboard_id,)).fetchone()
        widgets = conn.execute(
            "SELECT * FROM widgets WHERE dashboard_id = ? AND workspace_id = ? ORDER BY created_at ASC",
            (dashboard_id, auth.workspace_id),
        ).fetchall()
    finally:
        conn.close()

    return {"ok": True, "dashboard": _parse_dashboard(dict(updated), [dict(w) for w in widgets])}


@router.delete("/{dashboard_id}")
def delete_dashboard(dashboard_id: str, auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM dashboards WHERE id = ? AND workspace_id = ?", (dashboard_id, auth.workspace_id)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Dashboard not found")

        conn.execute("DELETE FROM widgets WHERE dashboard_id = ? AND workspace_id = ?", (dashboard_id, auth.workspace_id))
        conn.execute("DELETE FROM dashboards WHERE id = ? AND workspace_id = ?", (dashboard_id, auth.workspace_id))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.post("/{dashboard_id}/share")
async def share_dashboard(dashboard_id: str, request: Request, auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        dashboard = conn.execute(
            "SELECT id, share_token FROM dashboards WHERE id = ? AND workspace_id = ?",
            (dashboard_id, auth.workspace_id),
        ).fetchone()
        if not dashboard:
            raise HTTPException(404, "Dashboard not found")

        try:
            body = await request.json()
        except Exception:
            body = {}

        action = (body or {}).get("action", "generate")
        now = int(time.time() * 1000)

        if action == "revoke":
            conn.execute(
                "UPDATE dashboards SET share_token = NULL, is_published = 0, updated_at = ? WHERE id = ?",
                (now, dashboard_id),
            )
            conn.commit()
            return {"ok": True, "shareToken": None}

        token = str(uuid.uuid4())
        conn.execute(
            "UPDATE dashboards SET share_token = ?, is_published = 1, updated_at = ? WHERE id = ?",
            (token, now, dashboard_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "shareToken": token}
