"""
Port of src/lib/server/bq-creds.ts's resolveBqCreds, plus flattenBqRow (used
by both generate-dashboard/preview and widgets/[id]/data in the TS source).
"""

import json
import os
from dataclasses import dataclass
from typing import Any, Optional

import certifi
import truststore

# Local machines that run TLS-inspecting security software (antivirus "web
# shield" scanners, corporate proxies) re-sign HTTPS traffic with their own
# root CA, which is installed and trusted in the OS/Windows certificate
# store but NOT in Python's bundled `certifi` CAs — every BigQuery
# service-account token refresh then fails with CERTIFICATE_VERIFY_FAILED,
# even though the browser and Node.js (which use the OS store) work fine.
# `truststore` makes Python's ssl module defer to the OS trust store instead
# of certifi's, matching what Node.js already trusts. Must run before any
# ssl.SSLContext is created, so this happens at import time, first.
truststore.inject_into_ssl()
# Kept as a fallback for environments without OS-store TLS interception.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())

from google.cloud import bigquery
from google.oauth2 import service_account

from app.db import get_connection
from app.security.crypto import decrypt


@dataclass
class BqCreds:
    project_id: str
    dataset: str
    credentials: dict[str, Any]
    location: str


def resolve_bq_creds(user_id: str, workspace_id: Optional[str]) -> Optional[BqCreds]:
    conn = get_connection()
    try:
        row = None
        if workspace_id and workspace_id != "default":
            row = conn.execute(
                "SELECT data FROM credentials WHERE workspace_id = ? AND service = 'bigquery' LIMIT 1",
                (workspace_id,),
            ).fetchone()

        if not row:
            row = conn.execute(
                "SELECT data FROM credentials WHERE user_id = ? AND service = 'bigquery'",
                (user_id,),
            ).fetchone()

        if not row:
            return None

        try:
            creds = json.loads(decrypt(row["data"]))
        except Exception:
            return None

        if not creds.get("project_id") or not creds.get("service_json"):
            return None

        dataset = (creds.get("dataset") or "").strip()
        if workspace_id and workspace_id != "default":
            ws = conn.execute(
                "SELECT dataset_id FROM workspaces WHERE id = ?", (workspace_id,)
            ).fetchone()
            if ws and ws["dataset_id"]:
                dataset = ws["dataset_id"]

        if not dataset:
            dataset = os.environ.get("BIGQUERY_DEFAULT_DATASET", "crosstecch_data")

        return BqCreds(
            project_id=creds["project_id"].strip(),
            dataset=dataset,
            credentials=json.loads(creds["service_json"]),
            location=(creds.get("location") or os.environ.get("BIGQUERY_DEFAULT_LOCATION", "US")).strip(),
        )
    finally:
        conn.close()


def flatten_bq_row(row: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for k, v in row.items():
        if isinstance(v, dict) and "value" in v:
            out[k] = v["value"]
        else:
            out[k] = v
    return out


def make_client(creds: BqCreds) -> bigquery.Client:
    sa_credentials = service_account.Credentials.from_service_account_info(creds.credentials)
    return bigquery.Client(project=creds.project_id, credentials=sa_credentials)
