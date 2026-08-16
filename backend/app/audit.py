"""Port of writeAudit() from src/lib/server/audit.ts. Failures are swallowed —
an audit-log write must never be the reason a real action fails."""

import json
import time

from app.db import DEFAULT_WORKSPACE_ID, get_connection
from app.security.crypto import gen_id


def write_audit(
    action: str,
    workspace_id: str | None = None,
    user_id: str | None = None,
    resource: str | None = None,
    meta: dict | None = None,
    ip: str | None = None,
) -> None:
    try:
        conn = get_connection()
        try:
            conn.execute(
                """
                INSERT INTO audit_log (id, workspace_id, user_id, action, resource, meta, ip, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    gen_id("audit"),
                    workspace_id or DEFAULT_WORKSPACE_ID,
                    user_id,
                    action,
                    resource,
                    json.dumps(meta) if meta is not None else None,
                    ip,
                    int(time.time() * 1000),
                ),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:  # noqa: BLE001
        print(f"[audit] write failed (non-fatal): {e}")
