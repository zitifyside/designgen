"""현재 사용자 프로필, 비밀번호, 세션, 2FA."""
from __future__ import annotations

import datetime as dt

import pyotp
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbDep
from app.core.security import hash_password, verify_password
from app.models.user import Session
from app.schemas.common import Message
from app.schemas.user import (
    PasswordChangeIn,
    SessionOut,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/profile", response_model=UserOut)
async def get_profile(user: CurrentUser):
    return UserOut.from_model(user)


@router.patch("/profile", response_model=UserOut)
async def update_profile(body: UserUpdate, user: CurrentUser, db: DbDep):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.add(user)
    return UserOut.from_model(user)


@router.post("/password", response_model=Message)
async def change_password(body: PasswordChangeIn, user: CurrentUser, db: DbDep):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    user.password_hash = hash_password(body.new_password)
    db.add(user)
    return Message(detail="Password updated")


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(user: CurrentUser, db: DbDep):
    rows = (
        await db.scalars(
            select(Session)
            .where(Session.user_id == user.id, Session.revoked == False)  # noqa: E712
            .order_by(Session.created_at.desc())
        )
    ).all()
    return [
        SessionOut(
            id=s.id,
            device=s.device,
            location=s.location,
            lastActive=s.last_active_at,
            current=False,
        )
        for s in rows
    ]


@router.post("/sessions/{session_id}/logout", response_model=Message)
async def revoke_session(session_id: str, user: CurrentUser, db: DbDep):
    session = await db.get(Session, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    session.revoked = True
    return Message(detail="Session revoked")


@router.post("/2fa/enable", response_model=Message)
async def enable_2fa(user: CurrentUser, db: DbDep):
    # 최소한의 TOTP 설정. 실제 플로우에서는 provisioning URI / QR을 반환하고
    # 플래그를 켜기 전에 코드를 검증한다.
    user.two_factor_secret = pyotp.random_base32()
    user.two_factor_enabled = True
    db.add(user)
    return Message(detail="2FA enabled")


@router.post("/2fa/disable", response_model=Message)
async def disable_2fa(user: CurrentUser, db: DbDep):
    user.two_factor_enabled = False
    user.two_factor_secret = None
    db.add(user)
    return Message(detail="2FA disabled")
