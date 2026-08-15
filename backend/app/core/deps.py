"""FastAPI 의존성: DB 세션, 현재 사용자, 관리자 가드."""
from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_cookies import ACCESS_COOKIE
from app.core.database import get_db
from app.core.identity import get_pub
from app.core.security import ACCESS_TOKEN, decode_token
from app.models.user import Session, User

DbDep = Annotated[AsyncSession, Depends(get_db)]

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    db: DbDep,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        token = (request.cookies.get(ACCESS_COOKIE) or "").strip() or None
    if not token:
        raise _CREDENTIALS_EXC
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise _CREDENTIALS_EXC
    if payload.get("type") != ACCESS_TOKEN:
        raise _CREDENTIALS_EXC

    user = await get_pub(db, User, payload.get("sub"))
    if user is None or user.status == "Deleted" or user.deleted_at is not None:
        raise _CREDENTIALS_EXC
    if user.status == "Suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended"
        )
    sid = payload.get("sid")
    if sid:
        session = await get_pub(db, Session, sid)
        if session is None or session.revoked or session.user_id != user.id:
            raise _CREDENTIALS_EXC
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_admin_user(user: CurrentUser) -> User:
    if not user.is_admin and user.plan != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


AdminUser = Annotated[User, Depends(get_admin_user)]


# ── API Key 인증 (Public API · MCP Server) ────────────────────────
# 사용자 키는 `adg_<prefix>.<secret>` 형태이며 서버는 전체 문자열의 SHA-256 만
# 보관한다. prefix 로 후보를 좁힌 뒤 해시를 상수 시간 비교한다.
_API_KEY_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="유효한 API Key 가 필요합니다.",
    headers={"WWW-Authenticate": "Bearer"},
)

# 등급별 분당 호출 한도 (기능정의서 v0.2.0 §5.3).
API_RATE_LIMITS: dict[str, int] = {"Pro": 300, "Team": 600, "Admin": 600}


def _extract_api_key(authorization: str | None, x_api_key: str | None) -> str | None:
    if x_api_key:
        return x_api_key.strip()
    if authorization and authorization.lower().startswith("bearer "):
        candidate = authorization.split(" ", 1)[1].strip()
        # JWT 와 구분한다 — 사용자 키만 이 접두사를 가진다.
        if candidate.startswith("adg_"):
            return candidate
    return None


async def get_api_key_user(
    db: DbDep,
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> User:
    """API Key 로 사용자를 식별한다. 실패는 전부 동일한 401 로 답한다."""
    import hashlib
    import hmac as _hmac

    from sqlalchemy import select

    from app.models.platform import ApiKey

    raw = _extract_api_key(authorization, x_api_key)
    if not raw or "." not in raw:
        raise _API_KEY_EXC

    prefix = raw.split(".", 1)[0]
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    row = await db.scalar(
        select(ApiKey).where(ApiKey.prefix == prefix, ApiKey.revoked.is_(False))
    )
    # 키가 없더라도 같은 비용의 비교를 수행해 존재 여부를 흘리지 않는다.
    expected = row.key_hash if row is not None else "0" * 64
    if not _hmac.compare_digest(expected, digest) or row is None:
        raise _API_KEY_EXC

    user = await get_pub(db, User, row.user_id)
    if user is None or user.status != "Active":
        raise _API_KEY_EXC
    if user.plan not in API_RATE_LIMITS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public API 는 Pro 이상 등급에서 사용할 수 있습니다.",
        )

    # 사용 흔적을 남긴다 — 마지막 사용 시각은 키 회수 판단의 근거가 된다.
    import datetime as dt

    from app.core.security_middleware import hit_rate_limit

    retry = hit_rate_limit(f"apikey|{user.id}", 60, API_RATE_LIMITS[user.plan])
    if retry is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
            headers={"Retry-After": str(retry)},
        )

    row.last_used_at = dt.datetime.now(dt.timezone.utc)
    row.call_count += 1
    db.add(row)
    return user


ApiKeyUser = Annotated[User, Depends(get_api_key_user)]
