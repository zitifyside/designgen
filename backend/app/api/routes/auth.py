"""인증: 회원가입, 로그인, 토큰 갱신, 로그아웃."""
from __future__ import annotations

import datetime as dt

import jwt
from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select, update

from app.core.auth_cookies import REFRESH_COOKIE, auth_json, clear_auth_cookies

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep
from app.core.identity import get_pub
from app.core.observability import log_event, user_id_var
from app.core.security_middleware import validate_password_strength
from app.core.security import (
    REFRESH_TOKEN,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import Session, User
from app.seed import LOCKED_PRODUCTION_SEED_EMAILS
from app.services.two_factor import verify_second_factor
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

# 브루트포스 방어: 연속 실패 N회면 계정을 M분 잠근다.
# IP 단위 레이트 리밋(security_middleware)과 별개 축이다 — 분산 IP 공격은
# IP 제한을 우회하므로 계정 단위 잠금이 함께 있어야 한다.
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15

# 사용자 열거 방지용 더미 해시. 존재하지 않는 계정에도 같은 비용을 치른다.
_DUMMY_HASH = hash_password("adg-nonexistent-account-probe")


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _aware(value: dt.datetime | None) -> dt.datetime | None:
    """SQLite 는 naive datetime 을 돌려주므로 비교 전에 UTC 를 붙인다."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=dt.timezone.utc)


async def _issue_tokens(db: DbDep, user: User, device: str | None) -> TokenPair:
    refresh = create_refresh_token(user.id)
    jti = decode_token(refresh)["jti"]
    session = Session(
        user_id=user.id,
        refresh_jti=jti,
        device=device or "Unknown device",
        last_active_at=_now(),
        expires_at=_now() + dt.timedelta(days=settings.refresh_token_expire_days),
    )
    db.add(session)
    # access token 에 세션 ID 를 실어, 서버가 '지금 이 기기'를 알아볼 수 있게 한다.
    await db.flush()
    access = create_access_token(user.id, sid=session.id)
    user.last_active_at = _now()
    return TokenPair(
        access_token=access, refresh_token=refresh, user=UserOut.from_model(user)
    )


def _token_response(pair: TokenPair, status_code: int = 200) -> JSONResponse:
    return auth_json(
        jsonable_encoder(pair.model_dump(by_alias=True)),
        status_code=status_code,
        access=pair.access_token,
        refresh=pair.refresh_token,
    )


@router.post("/signup", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupIn,
    db: DbDep,
    user_agent: str | None = Header(default=None),
):
    if (body.website or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="가입에 실패했습니다."
        )
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        log_event(
            kind="auth.signup_conflict",
            level="warn",
            message="이미 등록된 이메일로 가입 시도",
            payload={"email_domain": body.email.split("@")[-1]},
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )
    validate_password_strength(body.password, email=str(body.email))
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
    from app.models.platform import TeamMembership

    invites = (
        await db.scalars(
            select(TeamMembership).where(
                TeamMembership.email == str(body.email),
                TeamMembership.user_id.is_(None),
            )
        )
    ).all()
    for invite in invites:
        invite.user_id = user.id
        invite.status = "Active"
        db.add(invite)
    user_id_var.set(user.id)
    log_event(
        kind="auth.signup",
        message="신규 가입",
        user_id=user.id,
        payload={"plan": user.plan},
    )
    return _token_response(await _issue_tokens(db, user, user_agent), 201)


@router.post("/login", response_model=TokenPair)
async def login(
    body: LoginIn,
    db: DbDep,
    user_agent: str | None = Header(default=None),
):
    # 운영에서 공개 관리자 시드만 거절한다. 데모 계정은 시연용으로 받는다.
    if (
        settings.environment == "production"
        and str(body.email).lower() in LOCKED_PRODUCTION_SEED_EMAILS
    ):
        verify_password(body.password, _DUMMY_HASH)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    user = await db.scalar(select(User).where(User.email == body.email))

    # 계정 잠금 확인이 비밀번호 검증보다 앞선다 — 잠긴 계정은 시도 자체를 받지 않는다.
    locked_until = _aware(user.locked_until) if user else None
    if user is not None and locked_until and locked_until > _now():
        remaining = int((locked_until - _now()).total_seconds() // 60) + 1
        log_event(
            kind="auth.login_locked",
            level="warn",
            message="잠긴 계정 로그인 시도",
            user_id=user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"로그인 시도가 너무 많습니다. {remaining}분 후 다시 시도해 주세요.",
        )

    # 계정 유무와 무관하게 같은 검증 비용을 치러 사용자 열거를 막는다.
    password_ok = verify_password(
        body.password, user.password_hash if user else _DUMMY_HASH
    )

    if user is None or not password_ok:
        if user is not None:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= MAX_FAILED_LOGINS:
                user.locked_until = _now() + dt.timedelta(minutes=LOCKOUT_MINUTES)
                user.failed_login_attempts = 0
                log_event(
                    kind="auth.account_locked",
                    level="warn",
                    message=f"연속 실패 {MAX_FAILED_LOGINS}회로 계정 잠금",
                    user_id=user.id,
                    payload={"lockout_minutes": LOCKOUT_MINUTES},
                )
            db.add(user)
            # 실패 카운터는 예외 전에 확정해야 한다 — 401 을 던지면 요청 세션이
            # 롤백되므로, 커밋하지 않으면 잠금이 영원히 걸리지 않는다.
            await db.commit()
        log_event(
            kind="auth.login_failed",
            level="warn",
            message="로그인 실패",
            user_id=user.id if user else None,
            payload={"reason": "invalid_credentials"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    if user.status == "Suspended":
        log_event(
            kind="auth.login_suspended",
            level="warn",
            message="정지된 계정 로그인 시도",
            user_id=user.id,
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")

    if user.two_factor_enabled:
        if not (body.totp_code or "").strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "totp_required",
                    "message": "2단계 인증 코드를 입력해 주세요.",
                },
            )
        if not verify_second_factor(user, body.totp_code or ""):
            log_event(
                kind="auth.login_2fa_failed",
                level="warn",
                message="2FA 코드 불일치",
                user_id=user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="인증 코드가 올바르지 않습니다.",
            )

    user.failed_login_attempts = 0
    user.locked_until = None
    user_id_var.set(user.id)
    log_event(kind="auth.login", message="로그인 성공", user_id=user.id)
    return _token_response(await _issue_tokens(db, user, user_agent))


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, db: DbDep, request: Request):
    raw = (body.refresh_token or "").strip() or request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    try:
        payload = decode_token(raw)
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if payload.get("type") != REFRESH_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    session = await db.scalar(
        select(Session).where(Session.refresh_jti == payload["jti"])
    )
    if session is None or session.revoked:
        # 이미 회전된 토큰의 재사용은 탈취 신호 — 그 사용자의 세션을 모두 끊는다.
        uid = payload.get("sub")
        log_event(
            kind="auth.refresh_reuse",
            level="warn",
            message="폐기된 리프레시 토큰 재사용 시도",
            user_id=uid,
        )
        if uid:
            await db.execute(
                update(Session)
                .where(Session.user_id == uid, Session.revoked.is_(False))
                .values(revoked=True)
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")

    user = await get_pub(db, User, payload["sub"])
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # 리프레시 토큰을 회전한다(일회용). 동시에 두 요청이 오면 한 쪽만 이긴다.
    claimed = await db.execute(
        update(Session)
        .where(Session.id == session.id, Session.revoked.is_(False))
        .values(revoked=True)
    )
    if claimed.rowcount == 0:
        log_event(
            kind="auth.refresh_reuse",
            level="warn",
            message="리프레시 회전 경합 — 재사용으로 처리",
            user_id=user.id,
        )
        await db.execute(
            update(Session)
            .where(Session.user_id == user.id, Session.revoked.is_(False))
            .values(revoked=True)
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")
    return _token_response(await _issue_tokens(db, user, session.device))


@router.post("/logout", response_model=Message)
async def logout(body: RefreshIn, db: DbDep, request: Request):
    raw = (body.refresh_token or "").strip() or request.cookies.get(REFRESH_COOKIE)
    empty = JSONResponse({"detail": "Logged out"})
    clear_auth_cookies(empty)
    if not raw:
        return empty
    try:
        payload = decode_token(raw)
    except jwt.PyJWTError:
        return empty
    session = await db.scalar(
        select(Session).where(Session.refresh_jti == payload.get("jti"))
    )
    if session is not None:
        session.revoked = True
        log_event(kind="auth.logout", message="로그아웃", user_id=session.user_id)
    return empty


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return UserOut.from_model(user)
