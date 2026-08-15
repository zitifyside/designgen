"""사용자 API Key 발급·조회·회수 (Pro 이상).

Public API·MCP Server 인증용 **사용자 키** 체계이며, LLM·Image Gen 호출에 쓰는
서비스 내부 **Provider Key** 와는 별개다 (기획서 v0.5.0 §4 F-204 제약사항).
2026-07 구현에서 제거됐던 발급 UI 를 문서 방침대로 복원한다.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import secrets

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.core.identity import get_pub
from app.models.platform import ApiKey
from app.schemas.common import Message
from app.schemas.platform import ApiKeyCreate, ApiKeyIssued, ApiKeyOut
from app.services.quota import require_plan

router = APIRouter(prefix="/users/api-keys", tags=["api-keys"])

API_KEY_PLANS = ("Pro", "Team", "Admin")
KEY_PREFIX = "adg"
MAX_ACTIVE_KEYS = 5


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.get("", response_model=list[ApiKeyOut])
async def list_api_keys(user: CurrentUser, db: DbDep):
    require_plan(user, API_KEY_PLANS, "API Key")
    rows = (
        await db.scalars(
            select(ApiKey)
            .where(ApiKey.user_id == user.id)
            .order_by(ApiKey.created_at.desc())
        )
    ).all()
    return [ApiKeyOut.model_validate(k) for k in rows]


@router.post("", response_model=ApiKeyIssued, status_code=status.HTTP_201_CREATED)
async def create_api_key(body: ApiKeyCreate, user: CurrentUser, db: DbDep):
    """평문 키는 발급 응답에서 1회만 노출된다. 서버는 해시만 보관한다."""
    require_plan(user, API_KEY_PLANS, "API Key")

    active = (
        await db.scalars(
            select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.revoked.is_(False))
        )
    ).all()
    if len(active) >= MAX_ACTIVE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"활성 API Key 는 최대 {MAX_ACTIVE_KEYS}개까지 보유할 수 있습니다.",
        )

    secret = secrets.token_urlsafe(32)
    prefix = f"{KEY_PREFIX}_{secrets.token_hex(4)}"
    raw = f"{prefix}.{secret}"

    row = ApiKey(
        user_id=user.id,
        label=body.label,
        prefix=prefix,
        key_hash=_hash(raw),
    )
    db.add(row)
    await db.flush()
    return ApiKeyIssued(
        id=row.id,
        label=row.label,
        prefix=row.prefix,
        last_used_at=None,
        call_count=0,
        revoked=False,
        created_at=row.created_at or dt.datetime.now(dt.timezone.utc),
        key=raw,
    )


@router.delete("/{key_id}", response_model=Message)
async def revoke_api_key(key_id: str, user: CurrentUser, db: DbDep):
    row = await get_pub(db, ApiKey, key_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    row.revoked = True
    db.add(row)
    return Message(detail="API key revoked")
