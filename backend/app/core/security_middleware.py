"""요청 단위 보안 가드: 응답 헤더 · 요청 크기 제한 · 레이트 리밋 · 시작 시 시크릿 점검.

레이트 리밋은 프로세스 메모리 기반 슬라이딩 윈도우다. 인스턴스가 하나인 현 구성
(`--max-instances 1`)에서는 정확하고, 다중 인스턴스로 늘리면 Redis 백엔드로 옮겨야
한다 — 그 전제를 코드에 남겨 둔다.
"""
from __future__ import annotations

import logging

import time
from collections import defaultdict, deque

import ipaddress
import re
from urllib.parse import urlparse

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.config import settings

# 모든 API 응답에 붙는 보안 헤더. 정적 호스팅(firebase.json)과 짝을 이룬다.
SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store, private, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Cookie, Origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": (
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
        "bluetooth=(), midi=(), interest-cohort=(), browsing-topics=()"
    ),
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    "X-Permitted-Cross-Domain-Policies": "none",
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
    ("/files", 3600, 20),
    # Public API 는 등급별 한도(Pro 300·Team 600/분)가 계약이지만, IP 단위
    # 1차 방어선은 상한(600)으로 둔다 — 등급 판정은 인증 이후라 여기선 알 수 없다.
    ("/api/v1/public", 60, 600),
    ("/api/v1", 60, 300),                 # 그 외 전체 API 분당 300회
)

_hits: dict[str, deque[float]] = defaultdict(deque)
_LAST_SWEEP = 0.0
_SWEEP_INTERVAL = 300.0


_IP_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$|^[0-9a-fA-F:]+$")


def client_ip(request: Request) -> str:
    """클라이언트 IP.

    이 스택은 Cloudflare 앞에 있지 않다. `CF-Connecting-IP` 는 누구나
    붙일 수 있으므로 쓰지 않는다. Cloud Run GFE 는 `X-Forwarded-For` 를
    덮어쓰므로 직접 호출 시 위조되지 않는다. Hosting rewrite 는 사용자
    IP 를 앞에 붙인다 — 그 **왼쪽** 값을 쓴다.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first and _IP_RE.match(first):
            return first
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    if real_ip and _IP_RE.match(real_ip):
        return real_ip
    return request.client.host if request.client else "unknown"


def _client_key(request: Request) -> str:
    return client_ip(request)


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


def hit_rate_limit(key: str, window: int, limit: int) -> int | None:
    """키 단위 슬라이딩 윈도우. 초과 시 Retry-After 초, 통과 시 None."""
    now = time.time()
    _sweep(now)
    bucket = _hits[key]
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        return max(1, int(window - (now - bucket[0])))
    bucket.append(now)
    return None


def ip_allowed(ip: str, allow: list[str]) -> bool:
    """빈 목록은 막지 않는다 (환경변수 누락 잠금 사고 방지)."""
    if not allow:
        return True
    try:
        addr = ipaddress.ip_address(ip.split("%")[0].replace("::ffff:", ""))
    except ValueError:
        return False
    for item in allow:
        raw = (item or "").strip()
        if not raw:
            continue
        try:
            if "/" in raw:
                if addr in ipaddress.ip_network(raw, strict=False):
                    return True
            elif addr == ipaddress.ip_address(raw.replace("::ffff:", "")):
                return True
        except ValueError:
            continue
    return False


_MUTATE = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def _csrf_allowed_hosts() -> set[str]:
    hosts: set[str] = set()
    for origin in settings.cors_origins:
        parsed = urlparse(origin if "://" in origin else f"https://{origin}")
        if parsed.netloc:
            hosts.add(parsed.netloc)
    return hosts


def enforce_csrf(request: Request) -> JSONResponse | None:
    """브라우저 변이 요청의 Origin/Referer 를 검사한다 (쿠키 세션 CSRF).

    Origin·Referer 가 둘 다 없으면 비브라우저(스모크·MCP)로 보고 통과한다.
    """
    if request.method not in _MUTATE:
        return None
    path = request.url.path
    if path.endswith("/webhook") or path.endswith("/stripe/webhook"):
        return None
    allowed = _csrf_allowed_hosts()
    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    if origin:
        netloc = urlparse(origin).netloc
        if netloc and netloc not in allowed:
            return JSONResponse(
                status_code=403,
                content={"detail": "요청 출처가 허용되지 않습니다."},
                headers=SECURITY_HEADERS,
            )
        return None
    if referer:
        netloc = urlparse(referer).netloc
        if netloc and netloc not in allowed:
            return JSONResponse(
                status_code=403,
                content={"detail": "요청 출처가 허용되지 않습니다."},
                headers=SECURITY_HEADERS,
            )
    return None


TRAP_PATHS = frozenset({
    "/__crawl-trap",
    "/api/v1/__crawl-trap",
    "/wp-admin",
    "/wp-login.php",
    "/xmlrpc.php",
    "/.env",
    "/.git/config",
    "/.git/HEAD",
})


class BodyTooLarge(Exception):
    """청크 전송으로 Content-Length 를 속인 본문."""


logger = logging.getLogger(__name__)


def enforce_ip_ban(request: Request) -> JSONResponse | None:
    from app.core.ip_ban import is_banned

    if is_banned(client_ip(request)):
        return JSONResponse(
            status_code=403,
            content={"detail": "접근이 거부되었습니다."},
            headers={**SECURITY_HEADERS, "Retry-After": "86400"},
        )
    return None


def enforce_crawl_trap(request: Request) -> JSONResponse | None:
    """숨은 링크·정찰 경로를 밟으면 24시간 IP 차단 (OP-05 L7)."""
    from app.core.ip_ban import ban_ip

    path = request.url.path
    trapped = path in TRAP_PATHS or path.startswith("/.git/")
    if not trapped:
        return None
    # 꺼져 있으면 함정 경로를 404 로만 돌려주고 IP 를 밴하지 않는다. 밴은
    # 24시간·프로세스 메모리라 한 번 걸리면 리비전을 새로 올려야 풀린다 —
    # QA 가 자기 IP 를 밴해 운영 전체가 403 이 된 일이 실제로 있었다.
    if not settings.crawl_trap_enabled:
        logger.warning(
            "crawl trap disabled — 함정 경로가 IP 를 밴하지 않는다. "
            "CRAWL_TRAP_ENABLED=true 로 되돌려라. path=%s",
            path,
        )
        return JSONResponse(
            status_code=404, content={"detail": "Not Found"}, headers=SECURITY_HEADERS
        )
    ban_ip(client_ip(request))
    return JSONResponse(
        status_code=404,
        content={"detail": "Not Found"},
        headers=SECURITY_HEADERS,
    )


def enforce_admin_ip(request: Request) -> JSONResponse | None:
    path = request.url.path
    if "/admin" not in path:
        return None
    allowed = settings.admin_allow_ips
    if not allowed:
        return None
    if ip_allowed(client_ip(request), allowed):
        return None
    return JSONResponse(
        status_code=403,
        content={"detail": "허용된 네트워크에서만 관리자 API 를 사용할 수 있습니다."},
        headers=SECURITY_HEADERS,
    )


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
    """약한 JWT 시크릿을 막는다. 운영은 기동 실패, 로컬은 기동 시 난수로 교체한다."""
    import secrets as secrets_mod

    key = settings.secret_key or ""
    weak = len(key) < 32 or any(marker in key.lower() for marker in WEAK_SECRET_MARKERS)
    if not weak:
        return
    if settings.environment == "production":
        raise RuntimeError(
            "운영 환경에서 SECRET_KEY 가 안전하지 않습니다. "
            "32자 이상의 무작위 값으로 교체한 뒤 재기동하세요."
        )
    settings.secret_key = secrets_mod.token_urlsafe(48)
