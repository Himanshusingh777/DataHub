"""
Shared SQLite access — points at the SAME .crosstecch/crosstecch.db file the
Next.js app already owns. This backend never runs its own migrations; the
Node app's src/lib/server/db.ts remains the schema source of truth for every
table this service reads/writes during the incremental migration.

better-sqlite3 already puts the DB in WAL mode, which allows one writer +
multiple concurrent readers across processes. We add a busy_timeout on every
connection so a transient lock from the Node process degrades to a short
wait instead of an immediate "database is locked" error.
"""

import os
import sqlite3
from pathlib import Path

DATA_DIR = Path(os.environ.get("CROSSTECCH_DATA_DIR", "../.crosstecch")).resolve()
DB_PATH = DATA_DIR / "crosstecch.db"

DEFAULT_WORKSPACE_ID = "default"
LOCAL_USER_ID = "local"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn
