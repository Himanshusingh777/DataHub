"""
Read-only model access + the two-step AI Dashboard Generator flow, ported
from:
  - src/app/api/models/[id]/generate-dashboard/preview/route.ts
  - src/app/api/models/[id]/generate-dashboard/route.ts

Model CRUD/run/versions stay on the Next.js app for this migration phase —
only the read needed to drive dashboard generation lives here.
"""

import json
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from google.cloud import bigquery

from app.audit import write_audit
from app.bigquery_client import flatten_bq_row, make_client, resolve_bq_creds
from app.dashboard_generator import generate_dashboard_candidates, layout_candidates
from app.db import get_connection
from app.deps import AuthContext, client_ip, get_auth_context, request_identity
from app.models_schemas import CHART_TYPE_SET, VALID_WIDGET_CATEGORIES
from app.rate_limit import RATE_LIMITS, check_rate_limit, rate_limit_key

router = APIRouter(prefix="/api/v1/models", tags=["models"])

SAMPLE_ROW_CAP = 500


@router.get("/{model_id}")
def get_model(model_id: str, auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM models WHERE id = ? AND workspace_id = ?", (model_id, auth.workspace_id)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(404, "Model not found")
    model = dict(row)
    try:
        model["schema"] = json.loads(model["schema_json"])
    except (TypeError, ValueError):
        model["schema"] = []
    return {"ok": True, "model": model}


@router.post("/{model_id}/generate-dashboard/preview")
def generate_dashboard_preview(model_id: str, request: Request, auth: AuthContext = Depends(get_auth_context)):
    identity = request_identity(request, auth.user_id)
    rl = check_rate_limit(rate_limit_key(identity, "ai-dashboard-preview"), RATE_LIMITS["warehouse"])
    if not rl.allowed:
        raise HTTPException(429, "Rate limit exceeded — please slow down.")

    conn = get_connection()
    try:
        model = conn.execute(
            "SELECT id, name, sql_query, source_dataset, schema_json FROM models WHERE id = ? AND workspace_id = ?",
            (model_id, auth.workspace_id),
        ).fetchone()
    finally:
        conn.close()
    if not model:
        raise HTTPException(404, "Model not found")

    try:
        schema = json.loads(model["schema_json"])
    except (TypeError, ValueError):
        schema = []
    if not schema:
        raise HTTPException(400, "Run this model at least once first — its column schema isn't known yet.")

    bq_creds = resolve_bq_creds(auth.user_id, auth.workspace_id)
    if not bq_creds:
        raise HTTPException(404, "BigQuery credentials not configured.")

    sample_rows: list[dict[str, Any]] = []
    try:
        client = make_client(bq_creds)
        base_sql = model["sql_query"].strip().rstrip(";").strip()
        dataset_ref = bigquery.DatasetReference(bq_creds.project_id, model["source_dataset"] or bq_creds.dataset)
        job_config = bigquery.QueryJobConfig(
            default_dataset=dataset_ref,
            maximum_bytes_billed=1_000_000_000,
        )
        query = f"WITH _model AS (\n{base_sql}\n)\nSELECT * FROM _model\nLIMIT {SAMPLE_ROW_CAP}"
        rows = client.query(query, job_config=job_config).result()
        sample_rows = [flatten_bq_row(dict(r.items())) for r in rows]
    except Exception as err:  # noqa: BLE001
        print(f"[generate-dashboard/preview] sample query failed, falling back to schema-only heuristics: {err}")

    candidates = generate_dashboard_candidates(schema, sample_rows)
    if not candidates:
        raise HTTPException(422, "Could not find enough usable columns in this model's schema to suggest charts.")

    return {
        "ok": True,
        "modelName": model["name"],
        "candidates": [
            {
                "id": c.id, "name": c.name, "chart_type": c.chart_type, "category": c.category,
                "reason": c.reason, "recommended": c.recommended, "config": c.config,
            }
            for c in candidates
        ],
    }


def _is_valid_candidate(c: Any) -> bool:
    if not isinstance(c, dict):
        return False
    return (
        isinstance(c.get("name"), str) and c["name"].strip() != ""
        and isinstance(c.get("chart_type"), str) and c["chart_type"] in CHART_TYPE_SET
        and isinstance(c.get("category"), str) and c["category"] in VALID_WIDGET_CATEGORIES
        and isinstance(c.get("config"), dict)
    )


@router.post("/{model_id}/generate-dashboard", status_code=201)
async def generate_dashboard(model_id: str, request: Request, auth: AuthContext = Depends(get_auth_context)):
    identity = request_identity(request, auth.user_id)
    rl = check_rate_limit(rate_limit_key(identity, "ai-dashboard-generate"), RATE_LIMITS["warehouse"])
    if not rl.allowed:
        raise HTTPException(429, "Rate limit exceeded — please slow down.")

    conn = get_connection()
    try:
        model = conn.execute(
            "SELECT id, name FROM models WHERE id = ? AND workspace_id = ?", (model_id, auth.workspace_id)
        ).fetchone()
        if not model:
            raise HTTPException(404, "Model not found")

        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")

        raw_candidates = body.get("candidates") if isinstance(body, dict) else None
        raw_candidates = raw_candidates if isinstance(raw_candidates, list) else []
        candidates = [c for c in raw_candidates if _is_valid_candidate(c)]
        if not candidates:
            raise HTTPException(400, "Select at least one chart to add to the dashboard.")

        widget_specs = layout_candidates(candidates)

        now = int(time.time() * 1000)
        dashboard_id = f"dsh_{uuid.uuid4().hex[:16]}"
        dashboard_name = f"{model['name']} — AI Dashboard"

        conn.execute(
            """
            INSERT INTO dashboards (id, workspace_id, user_id, name, description, theme, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dashboard_id, auth.workspace_id, auth.user_id, dashboard_name,
                f'Auto-generated from "{model["name"]}" by the AI Dashboard Generator.',
                "light", now, now,
            ),
        )

        for spec in widget_specs:
            widget_id = f"wgt_{uuid.uuid4().hex[:16]}"
            conn.execute(
                """
                INSERT INTO widgets
                  (id, dashboard_id, workspace_id, model_id, name, chart_type, config_json, position_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    widget_id, dashboard_id, auth.workspace_id, model["id"],
                    spec.name, spec.chart_type, json.dumps(spec.config), json.dumps(spec.position),
                    now, now,
                ),
            )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    write_audit(
        action="dashboard.ai_generated",
        workspace_id=auth.workspace_id, user_id=auth.user_id, resource=dashboard_id,
        meta={"modelId": model["id"], "modelName": model["name"], "widgetCount": len(widget_specs)},
        ip=client_ip(request),
    )

    return {
        "ok": True,
        "dashboard": {"id": dashboard_id, "name": dashboard_name},
        "widgetCount": len(widget_specs),
    }
