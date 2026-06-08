"""인증: 회원가입, 로그인, 토큰 갱신, 로그아웃."""
from __future__ import annotations

import datetime as dt

import jwt
from fastapi import APIRouter, Header, HTTPException, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep
from app.core.security import (
    REFRESH_TOKEN,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import Session, User
from app.schemas.common import Message
from app.schemas.user import (
    LoginIn,
    RefreshIn,
    SignupIn,
    TokenPair,
    UserOut,
)
from app.services.quota import plan_limits

router = APIRouter(prefix="/auth", tags=["auth"])


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


async def _issue_tokens(db: DbDep, user: User, device: str | None) -> TokenPair:
    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id)
    jti = decode_token(refresh)["jti"]
    db.add(
        Session(
            user_id=user.id,
            refresh_jti=jti,
            device=device or "Unknown device",
            last_active_at=_now(),
            expires_at=_now() + dt.timedelta(days=settings.refresh_token_expire_days),
        )
    )
    user.last_active_at = _now()
    return TokenPair(
        access_token=access, refresh_token=refresh, user=UserOut.from_model(user)
    )


@router.post("/signup", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupIn,
    db: DbDep,
    user_agent: str | None = Header(default=None),
):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )
    limit = plan_limits("Free")[0]
    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        plan="Free",
        credits=0,
        monthly_used=0,
        monthly_limit=limit,
    )
    db.add(user)
    await db.flush()
    return await _issue_tokens(db, user, user_agent)


@router.post("/login", response_model=TokenPair)
async def login(
    body: LoginIn,
    db: DbDep,
    user_agent: str | None = Header(default=None),
):
    user = await db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    if user.status == "Suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")
    return await _issue_tokens(db, user, user_agent)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, db: DbDep):
    try:
        payload = decode_token(body.refresh_token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if payload.get("type") != REFRESH_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    session = await db.scalar(
        select(Session).where(Session.refresh_jti == payload["jti"])
    )
    if session is None or session.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")

    user = await db.get(User, payload["sub"])
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # 리프레시 토큰을 회전한다(일회용).
    session.revoked = True
    return await _issue_tokens(db, user, session.device)


@router.post("/logout", response_model=Message)
async def logout(body: RefreshIn, db: DbDep):
    try:
        payload = decode_token(body.refresh_token)
    except jwt.PyJWTError:
        return Message(detail="Logged out")
    session = await db.scalar(
        select(Session).where(Session.refresh_jti == payload.get("jti"))
    )
    if session is not None:
        session.revoked = True
    return Message(detail="Logged out")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return UserOut.from_model(user)
