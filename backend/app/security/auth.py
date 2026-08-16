"""
Port of src/lib/server/auth.ts — session lookups only (session/user creation
stays on the Node app for now; this backend only ever reads the sessions
table it doesn't own).
"""

from app.db import LOCAL_USER_ID, get_connection

SESSION_COOKIE = "ct_session"


def get_user_id(session_cookie: str | None) -> str:
    if not session_cookie:
        return LOCAL_USER_ID
    try:
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT user_id, expires_at FROM sessions WHERE token = ?", (session_cookie,)
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return LOCAL_USER_ID
        import time

        if row["expires_at"] < time.time() * 1000:
            return LOCAL_USER_ID
        return row["user_id"]
    except Exception:
        return LOCAL_USER_ID


def get_session_user(session_cookie: str | None) -> dict | None:
    user_id = get_user_id(session_cookie)
    if user_id == LOCAL_USER_ID:
        return None
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, email, name FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None
