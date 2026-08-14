"""요청 단위 보안 가드: 응답 헤더 · 요청 크기 제한 · 레이트 리밋 · 시작 시 시크릿 점검.

레이트 리밋은 프로세스 메모리 기반 슬라이딩 윈도우다. 인스턴스가 하나인 현 구성
(`--max-instances 1`)에서는 정확하고, 다중 인스턴스로 늘리면 Redis 백엔드로 옮겨야
한다 — 그 전제를 코드에 남겨 둔다.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.config import settings

# 모든 API 응답에 붙는 보안 헤더. 정적 호스팅(firebase.json)과 짝을 이룬다.
SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

# 본문 상한 — 요건 텍스트 10,000자 + 여유. 초과 시 즉시 413.
MAX_BODY_BYTES = 2 * 1024 * 1024

# (경로 접두사, 창(초), 허용 횟수). 좁은 규칙을 먼저 둔다.
RATE_LIMITS: tuple[tuple[str, int, int], ...] = (
    ("/api/v1/auth/login", 300, 10),      # 로그인 5분당 10회
    ("/api/v1/auth/signup", 3600, 5),     # 가입 1시간당 5회
    ("/api/v1/auth/refresh", 300, 30),
    ("/api/v1/users/2fa", 300, 10),
    ("/api/v1/users/password", 3600, 10),
    ("/api/v1/generate", 3600, 60),
    ("/api/v1", 60, 300),                 # 그 외 전체 API 분당 300회
)

_hits: dict[str, deque[float]] = defaultdict(deque)
_LAST_SWEEP = 0.0
_SWEEP_INTERVAL = 300.0


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _sweep(now: float) -> None:
    """오래된 버킷을 주기적으로 비운다 (메모리 무한 증가 방지)."""
    global _LAST_SWEEP
    if now - _LAST_SWEEP < _SWEEP_INTERVAL:
        return
    _LAST_SWEEP = now
    for key in list(_hits):
        bucket = _hits[key]
        while bucket and now - bucket[0] > 3600:
            bucket.popleft()
        if not bucket:
            del _hits[key]


def _rate_rule(path: str) -> tuple[str, int, int] | None:
    for prefix, window, limit in RATE_LIMITS:
        if path.startswith(prefix) or prefix in path:
            return prefix, window, limit
    return None


def enforce_request_limits(request: Request) -> JSONResponse | None:
    """제한에 걸리면 응답을 돌려주고, 통과면 None 을 돌려준다."""
    if request.method == "OPTIONS":
        return None

    # 1) 본문 크기
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": "요청 본문이 너무 큽니다."},
            headers=SECURITY_HEADERS,
        )

    # 2) 레이트 리밋
    rule = _rate_rule(request.url.path)
    if rule is None:
        return None
    prefix, window, limit = rule

    now = time.time()
    _sweep(now)
    key = f"{_client_key(request)}|{prefix}"
    bucket = _hits[key]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        retry_after = max(1, int(window - (now - bucket[0])))
        return JSONResponse(
            status_code=429,
            content={
                "detail": "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
            },
            headers={**SECURITY_HEADERS, "Retry-After": str(retry_after)},
        )
    bucket.append(now)
    return None


# ── 비밀번호 정책 ─────────────────────────────────────────────────

MIN_PASSWORD_LENGTH = 8

# 유출 목록 상위권에서 뽑은 최소 차단 집합. 사전 전체를 들고 있을 필요는 없고,
# "숫자만"·"같은 문자 반복" 같은 구조 규칙이 실제로 더 많이 걸러낸다.
COMMON_PASSWORDS = {
    "password", "password1", "123456789", "12345678", "qwerty123",
    "111111111", "adminadmin", "letmein1", "welcome1", "iloveyou",
    "designgenerator", "adg12345",
}


def validate_password_strength(password: str, *, email: str = "") -> None:
    """약한 비밀번호를 가입·변경 시점에 거부한다.

    복잡도 규칙을 잔뜩 거는 대신 실제로 뚫리는 패턴만 막는다 —
    길이 미달·숫자만·문자 반복·흔한 값·이메일 아이디 포함.
    """
    value = (password or "").strip()
    if len(value) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"비밀번호는 최소 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다.",
        )
    lowered = value.lower()
    if lowered in COMMON_PASSWORDS:
        raise HTTPException(
            status_code=400, detail="너무 흔한 비밀번호입니다. 다른 값을 사용해 주세요."
        )
    if value.isdigit():
        raise HTTPException(
            status_code=400, detail="숫자로만 이루어진 비밀번호는 사용할 수 없습니다."
        )
    if len(set(value)) <= 3:
        raise HTTPException(
            status_code=400, detail="같은 문자의 반복은 비밀번호로 사용할 수 없습니다."
        )
    # 이메일 아이디 포함 여부는 구분자를 무시하고 본다 —
    # `weak2.live@…` 에 `weak2live` 를 쓰는 식으로 점 하나만 빼면 통과하던 구멍이 있었다.
    def alnum(value: str) -> str:
        return "".join(ch for ch in value.lower() if ch.isalnum())

    local = alnum((email or "").split("@")[0])
    if local and len(local) >= 4 and local in alnum(value):
        raise HTTPException(
            status_code=400, detail="비밀번호에 이메일 아이디를 포함할 수 없습니다."
        )


# ── 시작 시 시크릿 점검 ────────────────────────────────────────────

WEAK_SECRET_MARKERS = ("change-me", "changeme", "secret", "please")


def verify_production_secrets() -> None:
    """운영 환경에서 개발용 기본 시크릿이 그대로면 기동을 막는다.

    개발용 키로 운영에 뜨면 발급된 JWT 를 누구나 위조할 수 있다. 이건 경고로
    끝낼 문제가 아니라 기동 실패로 다뤄야 한다.
    """
    if settings.environment != "production":
        return
    key = settings.secret_key or ""
    weak = len(key) < 32 or any(marker in key.lower() for marker in WEAK_SECRET_MARKERS)
    if weak:
        raise RuntimeError(
            "운영 환경에서 SECRET_KEY 가 안전하지 않습니다. "
            "32자 이상의 무작위 값으로 교체한 뒤 재기동하세요."
        )
