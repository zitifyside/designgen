"""관측 기반: 구조화 로깅 · 요청 상관관계 · 이벤트 적재 단일 진입점.

설계 원칙
  · **로그 경로의 실패가 업무 요청을 실패시키지 않는다.** 모든 공개 함수는 예외를
    흡수한다. 관측이 없어지는 것보다 서비스가 죽는 게 나쁘다.
  · 이벤트는 세 곳으로 나간다 — 콘솔(JSON, Cloud Run 로그), 로컬 DB(운영 콘솔 조회),
    중앙 로그 허브(권위 저장소). 허브 전송은 services/loghub.py 가 맡는다.
  · 민감값은 저장 전에 지운다. 허브도 2차 마스킹을 하지만 애초에 보내지 않는다.
"""
from __future__ import annotations

import asyncio
import contextvars
import datetime as dt
import hashlib
import json
import logging
import sys
import uuid
from typing import Any

from app.core.config import settings
from app.models.logging import (
    LOG_LEVELS,
    TIER_AUDIT,
    TIER_ERROR,
    TIER_TELEMETRY,
    AppLogEvent,
)

# 요청 단위 상관관계 값 (미들웨어가 채운다).
trace_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "trace_id", default=None
)
user_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "user_id", default=None
)

# 허브 계약 §3.2 와 같은 키 목록. 부분 일치(대소문자·구분자 무시)로 본다.
SENSITIVE_KEY_PARTS = (
    "password", "passwd", "secret", "token", "apikey", "api_key",
    "authorization", "cookie", "creditcard", "cardnumber", "cvv",
    "ssn", "jumin", "privatekey", "signature",
)
MAX_MASK_DEPTH = 8
REDACTED = "[redacted]"

_LEVEL_ALIASES = {
    "warning": "warn",
    "err": "error",
    "critical": "fatal",
    "exception": "error",
}


def normalize_level(level: str | None) -> str:
    value = (level or "info").strip().lower()
    value = _LEVEL_ALIASES.get(value, value)
    return value if value in LOG_LEVELS else "info"


def _is_sensitive(key: str) -> bool:
    flat = key.lower().replace("-", "").replace("_", "")
    return any(part.replace("_", "") in flat for part in SENSITIVE_KEY_PARTS)


def mask(value: Any, depth: int = 0) -> Any:
    """민감 키를 재귀적으로 가린다 (허브 계약 §3.2 와 동일 규칙)."""
    if depth >= MAX_MASK_DEPTH:
        return "[truncated]"
    if isinstance(value, dict):
        return {
            k: (REDACTED if _is_sensitive(str(k)) else mask(v, depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [mask(v, depth + 1) for v in value]
    if isinstance(value, str):
        # 값 자체가 자격증명 형태인 경우도 가린다.
        lowered = value.lower()
        if lowered.startswith("bearer ") or value.startswith(("sk-", "ghp_", "AIza", "eyJ")):
            return REDACTED
    return value


def hash_ip(ip: str | None) -> str | None:
    """원본 IP 는 저장하지 않는다 — 솔트 해시 앞 32자만 남긴다."""
    if not ip:
        return None
    salted = f"{ip}:{settings.secret_key}".encode("utf-8")
    return hashlib.sha256(salted).hexdigest()[:32]


def hash_actor(user_id: str | None) -> str | None:
    """허브로 보낼 행위자 식별자 (원본 금지, 해시만)."""
    if not user_id:
        return None
    return hashlib.sha256(
        f"{user_id}:{settings.mae_loghub_project_id}".encode("utf-8")
    ).hexdigest()[:32]


# ── 콘솔 로거 (JSON 한 줄) ────────────────────────────────────────


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "time": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        trace = trace_id_var.get()
        if trace:
            payload["trace"] = trace
        extra = getattr(record, "event", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            payload["stack"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """루트 로거를 JSON 한 줄 출력으로 바꾼다 (Cloud Run 이 그대로 파싱한다)."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
    # 접근 로그는 우리 미들웨어가 구조화해 남기므로 uvicorn 기본 로그는 줄인다.
    logging.getLogger("uvicorn.access").handlers = []
    logging.getLogger("uvicorn.access").propagate = False


logger = logging.getLogger("adg")


# ── 이벤트 적재 ──────────────────────────────────────────────────


def build_event(
    *,
    kind: str,
    level: str = "info",
    message: str | None = None,
    tier: str | None = None,
    payload: dict[str, Any] | None = None,
    stack: str | None = None,
    user_id: str | None = None,
    trace_id: str | None = None,
    source: str | None = None,
    method: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    duration_ms: int | None = None,
    ip: str | None = None,
) -> AppLogEvent:
    normalized = normalize_level(level)
    if tier is None:
        tier = TIER_ERROR if normalized in ("error", "fatal") else TIER_TELEMETRY
    return AppLogEvent(
        event_id=str(uuid.uuid4()),
        occurred_at=dt.datetime.now(dt.timezone.utc),
        level=normalized,
        tier=tier,
        kind=kind[:80],
        message=(message or "")[:4000] or None,
        trace_id=(trace_id or trace_id_var.get()),
        user_id=user_id or user_id_var.get(),
        source=(source or settings.service_name)[:80],
        method=method,
        path=(path or "")[:255] or None,
        status_code=status_code,
        duration_ms=duration_ms,
        ip_hash=hash_ip(ip),
        payload=mask(payload) if payload else None,
        stack=(stack or "")[:20000] or None,
    )


def log_event(
    *,
    kind: str,
    level: str = "info",
    message: str | None = None,
    **fields: Any,
) -> None:
    """이벤트를 콘솔 · 로컬 DB · 허브 큐에 남긴다.

    ⚠ DB 적재는 **요청 트랜잭션과 분리된 세션**으로 한다. 요청 세션에 붙이면
    실패 경로(로그인 실패·쿼터 차단 등)에서 롤백과 함께 로그가 통째로 사라진다 —
    정작 가장 남겨야 할 이벤트들이다.
    """
    try:
        event = build_event(kind=kind, level=level, message=message, **fields)
        _emit_console(event)
        _queue_for_hub(event)
        _persist(event)
    except Exception:  # noqa: BLE001 — 관측 실패가 업무를 막지 않는다
        logger.warning("log_event_failed", exc_info=True)


def _persist(event: AppLogEvent) -> None:
    """자체 세션으로 적재한다. 이벤트 루프가 있으면 비동기로 흘려보낸다."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # 루프 밖(스크립트·테스트) — 콘솔 로그만 남는다.
    loop.create_task(_persist_async(event))


async def _persist_async(event: AppLogEvent) -> None:
    from app.core.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            db.add(event)
            await db.commit()
    except Exception:  # noqa: BLE001
        logger.warning("log_persist_failed", exc_info=True)


def _emit_console(event: AppLogEvent) -> None:
    level_map = {
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warn": logging.WARNING,
        "error": logging.ERROR,
        "fatal": logging.CRITICAL,
    }
    logger.log(
        level_map.get(event.level, logging.INFO),
        event.message or event.kind,
        extra={
            "event": {
                "kind": event.kind,
                "user": event.user_id,
                "status": event.status_code,
                "durationMs": event.duration_ms,
                "path": event.path,
            }
        },
    )


def _queue_for_hub(event: AppLogEvent) -> None:
    # 순환 import 회피 — loghub 는 이 모듈의 마스킹을 쓴다.
    from app.services.loghub import enqueue

    enqueue(event)


__all__ = [
    "TIER_AUDIT",
    "TIER_ERROR",
    "TIER_TELEMETRY",
    "build_event",
    "configure_logging",
    "hash_actor",
    "hash_ip",
    "log_event",
    "logger",
    "mask",
    "normalize_level",
    "trace_id_var",
    "user_id_var",
]
