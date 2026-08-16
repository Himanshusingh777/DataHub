"""FastAPI dependency: resolve {user_id, workspace_id} from the request, same
as getAuthContext() in src/lib/server/auth.ts. Demo/anonymous requests map to
the "local" user + "default" workspace, matching the Node app's behavior."""

from dataclasses import dataclass

from fastapi import Request

from app.db import LOCAL_USER_ID
from app.security.auth import SESSION_COOKIE, get_user_id
from app.security.workspace import WORKSPACE_COOKIE, WORKSPACE_HEADER, resolve_workspace_for_request


@dataclass
class AuthContext:
    user_id: str
    workspace_id: str


def get_auth_context(request: Request) -> AuthContext:
    session_cookie = request.cookies.get(SESSION_COOKIE)
    user_id = get_user_id(session_cookie)
    workspace_id = resolve_workspace_for_request(
        user_id,
        request.headers.get(WORKSPACE_HEADER),
        request.cookies.get(WORKSPACE_COOKIE),
    )
    return AuthContext(user_id=user_id, workspace_id=workspace_id)


def request_identity(request: Request, user_id: str) -> str:
    if user_id and user_id != LOCAL_USER_ID:
        return user_id
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else "unknown"


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.headers.get("x-real-ip")
