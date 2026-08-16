"""
Port of the read side of src/lib/server/workspace.ts's getWorkspaceForRequest.

This backend only reads workspace resolution — it never provisions a new
workspace (ensureUserWorkspace's lazy-provision + data-migration side effects
stay on the Node app, which already runs them on every login). By the time
a request reaches a migrated route here, the user has necessarily logged in
through the Node app at least once, so their workspace already exists.
"""

from app.db import DEFAULT_WORKSPACE_ID, LOCAL_USER_ID, get_connection

WORKSPACE_HEADER = "x-workspace-id"
WORKSPACE_COOKIE = "ct_workspace"


def resolve_workspace_for_request(
    user_id: str, header_value: str | None, cookie_value: str | None
) -> str:
    if user_id == LOCAL_USER_ID:
        return DEFAULT_WORKSPACE_ID

    if header_value:
        return header_value
    if cookie_value:
        return cookie_value

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    return row["id"] if row else DEFAULT_WORKSPACE_ID
