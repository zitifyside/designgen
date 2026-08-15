"""TOTP·백업 코드 검증.

로그인·활성화·해제가 같은 규칙을 쓰게 한곳에 둔다.
백업 코드는 한 번 쓰면 목록에서 빼 다시 쓸 수 없다.
"""
from __future__ import annotations

import pyotp

from app.models.user import User


def normalize_otp(code: str) -> str:
    return "".join(ch for ch in (code or "") if ch.isalnum()).upper()


def totp_digits(code: str) -> str:
    return "".join(ch for ch in (code or "") if ch.isdigit())


def verify_totp(secret: str | None, code: str) -> bool:
    if not secret:
        return False
    digits = totp_digits(code)
    if len(digits) != 6:
        return False
    try:
        return bool(pyotp.TOTP(secret).verify(digits, valid_window=1))
    except Exception:
        return False


def consume_backup_code(user: User, code: str) -> bool:
    raw = normalize_otp(code)
    if len(raw) < 8:
        return False
    stored = [normalize_otp(item) for item in (user.two_factor_backup_codes or [])]
    try:
        idx = stored.index(raw)
    except ValueError:
        return False
    remaining = list(user.two_factor_backup_codes or [])
    remaining.pop(idx)
    user.two_factor_backup_codes = remaining
    return True


def verify_second_factor(user: User, code: str) -> bool:
    """TOTP 6자리 또는 미사용 백업 코드를 받는다. 백업 코드는 소모한다."""
    if verify_totp(user.two_factor_secret, code):
        return True
    return consume_backup_code(user, code)
