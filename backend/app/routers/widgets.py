"""
Port of:
  - src/app/api/widgets/route.ts           (create)
  - src/app/api/widgets/[id]/route.ts       (update, delete)
  - src/app/api/widgets/[id]/data/route.ts  (execute widget's model SQL against BigQuery)
"""

import json
import re
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from google.cloud import bigquery

from app.bigquery_client import flatten_bq_row, make_client, resolve_bq_creds
from app.db import get_connection
from app.deps import AuthContext, get_auth_context
from app.models_schemas import CHART_TYPE_SET

router = APIRouter(prefix="/api/v1/widgets", tags=["widgets"])

WIDGET_ROW_CAP = 5_000
_SAFE_FIELD = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


@router.post("", status_code=201)
async def create_widget(request: Request, auth: AuthContext = Depends(get_auth_context)):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    dashboard_id = body.get("dashboard_id")
    model_id = body.get("model_id")
    name = (body.get("name") or "").strip()
    chart_type = body.get("chart_type", "table")
    config = body.get("config", {})
    position = body.get("position", {"x": 0, "y": 0, "w": 6, "h": 4})

    if not dashboard_id:
        raise HTTPException(400, "dashboard_id is required")
    if not model_id:
        raise HTTPException(400, "model_id is required — widgets must be created from a Semantic Model")
    if not name:
        raise HTTPException(400, "name is required")
    if chart_type not in CHART_TYPE_SET:
        raise HTTPException(400, f'Unknown chart_type: "{chart_type}"')

    conn = get_connection()
    try:
        dashboard = conn.execute(
            "SELECT id FROM dashboards WHERE id = ? AND workspace_id = ?", (dashboard_id, auth.workspace_id)
        ).fetchone()
        if not dashboard:
            raise HTTPException(404, "Dashboard not found")

        model = conn.execute(
            "SELECT id, status FROM models WHERE id = ? AND workspace_id = ?", (model_id, auth.workspace_id)
        ).fetchone()
        if not model:
            raise HTTPException(404, "Model not found")

        widget_id = f"wgt_{uuid.uuid4().hex[:16]}"
        now = int(time.time() * 1000)

        conn.execute(
            """
            INSERT INTO widgets
              (id, dashboard_id, workspace_id, model_id, name, chart_type, config_json, position_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (widget_id, dashboard_id, auth.workspace_id, model_id, name, chart_type, json.dumps(config), json.dumps(position), now, now),
        )
        conn.execute("UPDATE dashboards SET updated_at = ? WHERE id = ?", (now, dashboard_id))
        conn.commit()

        created = dict(conn.execute("SELECT * FROM widgets WHERE id = ?", (widget_id,)).fetchone())
    finally:
        conn.close()

    return {"ok": True, "widget": {**created, "config": config, "position": position}}


@router.put("/{widget_id}")
async def update_widget(widget_id: str, request: Request, auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id, dashboard_id FROM widgets WHERE id = ? AND workspace_id = ?", (widget_id, auth.workspace_id)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Widget not found")

        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON body")

        if body.get("model_id"):
            model = conn.execute(
                "SELECT id FROM models WHERE id = ? AND workspace_id = ?", (body["model_id"], auth.workspace_id)
            ).fetchone()
            if not model:
                raise HTTPException(404, "Model not found")

        chart_type = body.get("chart_type")
        if chart_type and chart_type not in CHART_TYPE_SET:
            raise HTTPException(400, f'Unknown chart_type: "{chart_type}"')

        now = int(time.time() * 1000)
        name = body.get("name")
        config = body.get("config")
        position = body.get("position")

        conn.execute(
            """
            UPDATE widgets SET
              name          = COALESCE(?, name),
              chart_type    = COALESCE(?, chart_type),
              config_json   = COALESCE(?, config_json),
              position_json = COALESCE(?, position_json),
              model_id      = COALESCE(?, model_id),
              updated_at    = ?
            WHERE id = ? AND workspace_id = ?
            """,
            (
                name.strip() if isinstance(name, str) else None,
                chart_type,
                json.dumps(config) if config is not None else None,
                json.dumps(position) if position is not None else None,
                body.get("model_id"),
                now,
                widget_id, auth.workspace_id,
            ),
        )
        conn.execute("UPDATE dashboards SET updated_at = ? WHERE id = ?", (now, existing["dashboard_id"]))
        conn.commit()

        updated = dict(conn.execute("SELECT * FROM widgets WHERE id = ?", (widget_id,)).fetchone())
    finally:
        conn.close()

    return {"ok": True, "widget": updated}


@router.delete("/{widget_id}")
def delete_widget(widget_id: str, auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id, dashboard_id FROM widgets WHERE id = ? AND workspace_id = ?", (widget_id, auth.workspace_id)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Widget not found")

        conn.execute("DELETE FROM widgets WHERE id = ? AND workspace_id = ?", (widget_id, auth.workspace_id))
        conn.execute("UPDATE dashboards SET updated_at = ? WHERE id = ?", (int(time.time() * 1000), existing["dashboard_id"]))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


def _build_filter_clause(filters: list[dict[str, Any]]) -> tuple[str, list[Any]]:
    parts: list[str] = []
    values: list[Any] = []

    for f in filters:
        field = f.get("field", "")
        if not _SAFE_FIELD.match(field):
            continue
        op = f.get("op")
        value = f.get("value")
        if op == "eq":
            parts.append(f"`{field}` = ?"); values.append(value)
        elif op == "neq":
            parts.append(f"`{field}` != ?"); values.append(value)
        elif op == "gt":
            parts.append(f"`{field}` > ?"); values.append(value)
        elif op == "gte":
            parts.append(f"`{field}` >= ?"); values.append(value)
        elif op == "lt":
            parts.append(f"`{field}` < ?"); values.append(value)
        elif op == "lte":
            parts.append(f"`{field}` <= ?"); values.append(value)
        elif op == "contains":
            parts.append(f"LOWER(`{field}`) LIKE ?"); values.append(f"%{str(value).lower()}%")
        elif op == "in" and isinstance(value, list) and value:
            parts.append(f"`{field}` IN ({','.join('?' for _ in value)})")
            values.extend(value)

    clause = f"WHERE {' AND '.join(parts)}" if parts else ""
    return clause, values


@router.post("/{widget_id}/data")
async def get_widget_data(widget_id: str, request: Request, auth: AuthContext = Depends(get_auth_context)):
    conn = get_connection()
    try:
        widget = conn.execute(
            "SELECT * FROM widgets WHERE id = ? AND workspace_id = ?", (widget_id, auth.workspace_id)
        ).fetchone()
        if not widget:
            raise HTTPException(404, "Widget not found")

        model = conn.execute(
            "SELECT id, name, sql_query, source_dataset FROM models WHERE id = ? AND workspace_id = ?",
            (widget["model_id"], auth.workspace_id),
        ).fetchone()
        if not model:
            raise HTTPException(404, "Model not found for this widget")
    finally:
        conn.close()

    try:
        body = await request.json()
    except Exception:
        body = {}
    body = body or {}

    bq_creds = resolve_bq_creds(auth.user_id, auth.workspace_id)
    if not bq_creds:
        raise HTTPException(404, "BigQuery credentials not configured.")

    row_limit = min(body.get("limit") or WIDGET_ROW_CAP, WIDGET_ROW_CAP)
    filter_clause, filter_values = _build_filter_clause(body.get("filters") or [])

    base_sql = model["sql_query"].strip().rstrip(";").strip()
    if filter_clause:
        final_sql = f"WITH _model AS (\n{base_sql}\n)\nSELECT * FROM _model\n{filter_clause}\nLIMIT {row_limit}"
    else:
        final_sql = f"WITH _model AS (\n{base_sql}\n)\nSELECT * FROM _model\nLIMIT {row_limit}"

    dataset = model["source_dataset"] or bq_creds.dataset
    started = time.time() * 1000

    try:
        client = make_client(bq_creds)
        dataset_ref = bigquery.DatasetReference(bq_creds.project_id, dataset)
        query_parameters = [
            bigquery.ScalarQueryParameter(None, "STRING", v) if isinstance(v, str) else
            bigquery.ScalarQueryParameter(None, "FLOAT64", v) if isinstance(v, (int, float))
            else bigquery.ScalarQueryParameter(None, "STRING", str(v))
            for v in filter_values
        ] if filter_values else []
        job_config = bigquery.QueryJobConfig(
            default_dataset=dataset_ref,
            maximum_bytes_billed=1_000_000_000,
            query_parameters=query_parameters,
        )
        # BigQuery standard SQL uses named/positional @params, not "?" — the
        # filter clause above builds "?" placeholders matching the TS
        # (node-bigquery) driver's positional-param convention. The Python
        # client requires "?"-positional params too when query_parameters is
        # a plain list, so no query rewrite is needed here.
        job = client.query(final_sql, job_config=job_config)
        rows = list(job.result())
        duration_ms = time.time() * 1000 - started
        bytes_processed = job.total_bytes_processed or 0
        clean = [flatten_bq_row(dict(r.items())) for r in rows]

        schema = []
        if clean:
            for name, val in clean[0].items():
                if isinstance(val, (int, float)):
                    t = "FLOAT64"
                elif hasattr(val, "isoformat"):
                    t = "TIMESTAMP"
                else:
                    t = "STRING"
                schema.append({"name": name, "type": t})

        try:
            config = json.loads(widget["config_json"])
        except (TypeError, ValueError):
            config = {}

        return {
            "ok": True,
            "rows": clean,
            "schema": schema,
            "chartType": widget["chart_type"],
            "config": config,
            "modelName": model["name"],
            "rowCount": len(clean),
            "durationMs": duration_ms,
            "bytesProcessed": bytes_processed,
            "capped": len(clean) >= row_limit,
        }
    except Exception as err:  # noqa: BLE001
        raise HTTPException(500, str(err))
