"""계정 논리삭제 확정·익명화 (DA 논리삭제.md §7).

30일 유예가 끝나면 deleted_at 을 찍고, 1년이 지나면 개인정보를 지운다.
행 자체는 FK 를 위해 남긴다.
"""
from __future__ import annotations

import datetime as dt
import logging
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.base import SYSTEM_ACTOR_ID
from app.models.user import Session, User

logger = logging.getLogger("adg")

DELETION_GRACE_DAYS = 30
ANONYMIZE_AFTER_DAYS = 365


async def purge_due_accounts(db: AsyncSession) -> dict[str, int]:
    """유예 만료 계정을 논리 삭제하고, 보관 만료 계정은 익명화한다."""
    now = dt.datetime.now(dt.timezone.utc)
    soft = await _finalize_requested(db, now)
    anon = await _anonymize_expired(db, now)
    if soft or anon:
        await db.flush()
        logger.info("account_purge", extra={"event": {"soft": soft, "anonymized": anon}})
    return {"soft_deleted": soft, "anonymized": anon}


async def _finalize_requested(db: AsyncSession, now: dt.datetime) -> int:
    cutoff = now - dt.timedelta(days=DELETION_GRACE_DAYS)
    rows = (
        await db.scalars(
            select(User).where(
                User.deletion_requested_at.is_not(None),
                User.deletion_requested_at <= cutoff,
                User.deleted_at.is_(None),
            )
        )
    ).all()
    for user in rows:
        user.deleted_at = now
        user.deleted_by = SYSTEM_ACTOR_ID
        user.status = "Deleted"
        await _revoke_sessions(db, user.id)
        db.add(user)
    return len(rows)


async def _anonymize_expired(db: AsyncSession, now: dt.datetime) -> int:
    cutoff = now - dt.timedelta(days=ANONYMIZE_AFTER_DAYS)
    rows = (
        await db.scalars(
            select(User)
            .where(
                User.deleted_at.is_not(None),
                User.deleted_at <= cutoff,
                User.email.notlike("purged+%"),
            )
            .execution_options(include_deleted=True)
        )
    ).all()
    for user in rows:
        user.email = f"purged+{user.id}@invalid.local"
        user.name = "삭제된 사용자"
        user.password_hash = hash_password(secrets.token_urlsafe(32))
        user.avatar = None
        user.two_factor_enabled = False
        user.two_factor_secret = None
        user.two_factor_backup_codes = None
        user.notification_prefs = None
        user.status = "Deleted"
        await _revoke_sessions(db, user.id)
        db.add(user)
    return len(rows)


async def _revoke_sessions(db: AsyncSession, user_id: str) -> None:
    sessions = (
        await db.scalars(
            select(Session)
            .where(Session.user_id == user_id, Session.revoked.is_(False))
            .execution_options(include_deleted=True)
        )
    ).all()
    for session in sessions:
        session.revoked = True
        db.add(session)
