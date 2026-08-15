"""HttpOnly 인증 쿠키 (Security 인증_세션.md §2)."""
from __future__ import annotations

from fastapi.responses import JSONResponse, Response

from app.core.config import settings

ACCESS_COOKIE = "adg_at"
REFRESH_COOKIE = "adg_rt"


def _secure() -> bool:
    return settings.environment == "production"


def attach_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        access,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=_secure(),
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=_secure(),
        samesite="lax",
        path="/api/v1/auth",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")


def auth_json(payload: dict, *, status_code: int = 200, access: str, refresh: str) -> JSONResponse:
    response = JSONResponse(status_code=status_code, content=payload)
    attach_auth_cookies(response, access, refresh)
    return response
