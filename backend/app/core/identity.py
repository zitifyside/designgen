"""대리키 조회 — API·JWT 는 public_id, PK 는 BIGINT (DA PK_FK규칙)."""
from __future__ import annotations

from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


async def get_pub(
    db: AsyncSession,
    model: type[T],
    public_id: str | None,
    *,
    for_update: bool = False,
) -> T | None:
    """외부 식별자(public_id / 모델.id)로 한 건을 찾는다."""
    if not public_id:
        return None
    stmt = select(model).where(model.id == public_id)
    if for_update:
        stmt = stmt.with_for_update()
    return await db.scalar(stmt)
