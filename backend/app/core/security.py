"""비밀번호 해싱 및 JWT 토큰 헬퍼."""
from __future__ import annotations

import datetime as dt
import secrets

import bcrypt
import jwt

from app.core.config import settings

ACCESS_TOKEN = "access"
REFRESH_TOKEN = "refresh"


# ── 비밀번호 ──────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── JWT ────────────────────────────────────────────────────────────
def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _create_token(
    subject: str, token_type: str, expires: dt.timedelta, *, sid: str | None = None
) -> str:
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": _now(),
        "exp": _now() + expires,
        "jti": secrets.token_urlsafe(16),
    }
    # 세션 식별자. 이게 없으면 '지금 쓰는 기기'를 서버가 알 수 없어 세션 목록의
    # 현재 표시도, '나머지 기기 로그아웃'도 만들 수 없다.
    if sid:
        payload["sid"] = sid
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str, *, sid: str | None = None) -> str:
    return _create_token(
        subject,
        ACCESS_TOKEN,
        dt.timedelta(minutes=settings.access_token_expire_minutes),
        sid=sid,
    )


def create_refresh_token(subject: str) -> str:
    return _create_token(
        subject,
        REFRESH_TOKEN,
        dt.timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(token: str) -> dict:
    """토큰이 유효하지 않거나 만료된 경우 jwt.PyJWTError를 발생시킵니다."""
    return jwt.decode(
        token, settings.secret_key, algorithms=[settings.jwt_algorithm]
    )


def new_token(nbytes: int = 32) -> str:
    """불투명한 랜덤 토큰 (이메일 인증, 비밀번호 재설정, 공유 링크)."""
    return secrets.token_urlsafe(nbytes)
