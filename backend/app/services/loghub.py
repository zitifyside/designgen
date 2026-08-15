"""중앙 로그 허브(마에 loghub) 전송기.

계약 SSOT (읽기 참조):
  D:/Project/mae/docs/기획/로그허브/Mae_중앙로그허브_구현명세_v1.0.0.md §3.1·§5.1

  POST {MAE_LOGHUB_URL}/v1/ingest
  headers: x-mae-project, x-mae-timestamp(unix ms), x-mae-nonce, x-mae-signature
  서명   : HMAC_SHA256(key, project_id + "\n" + ts + "\n" + nonce + "\n" + sha256hex(body))
  body   : {"events":[ ...최대 500건 ]}
  응답   : 200 {"accepted":n,"duplicated":n,"rejected":[{"index":i,"reason":"..."}]}

설계 원칙
  · **전송 실패가 업무 요청을 실패시키지 않는다.** 공개 함수는 절대 예외를 던지지 않는다.
  · 미설정(URL·KEY 없음)이면 완전 무동작이다.
  · 연속 실패 시 서킷을 열어 죽은 허브를 계속 두드리지 않는다.
  · 허브는 **일부 이벤트만 거절해도 200** 을 준다 — 응답의 rejected 를 보지 않으면
    스키마 불일치가 조용히 사라진다. 그래서 거절 사유를 경고로 남긴다.

⚠ 허브 앞단 Cloudflare 가 기본 User-Agent 를 1010 으로 차단한다. UA 를 반드시 붙인다
  (2026-08-14 실측 — UA 없이 보내면 인증 이전 단계에서 403).
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

import httpx

from app.core.config import settings
from app.core.observability import hash_actor, logger
from app.models.logging import AppLogEvent

BUFFER_LIMIT = 1000
BATCH_SIZE = 200
MAX_BATCH = 500  # 허브 상한
FLUSH_INTERVAL_SEC = 2.0
REQUEST_TIMEOUT_SEC = 3.0
CIRCUIT_OPEN_SEC = 30.0
CIRCUIT_FAILURE_THRESHOLD = 5
MAX_PAYLOAD_CHARS = 32_000
USER_AGENT = f"{settings.service_name}-loghub/{settings.service_version}"

_buffer: list[dict[str, Any]] = []
_dropped = 0
_in_flight = False
_consecutive_failures = 0
_circuit_open_until = 0.0
_last_warn_at = 0.0
_last_reject_warn_at = 0.0
_flush_task: asyncio.Task | None = None


def is_enabled() -> bool:
    return bool(
        settings.mae_loghub_url
        and settings.mae_loghub_key
        and settings.log_sink_mode != "local"
        and settings.log_sink_mode != "off"
    )


def stats() -> dict[str, Any]:
    """운영 콘솔이 보는 전송기 상태."""
    return {
        "enabled": is_enabled(),
        "mode": settings.log_sink_mode,
        "projectId": settings.mae_loghub_project_id,
        "environment": settings.loghub_environment,
        "buffered": len(_buffer),
        "dropped": _dropped,
        "circuitOpen": time.time() < _circuit_open_until,
    }


def to_hub_event(event: AppLogEvent) -> dict[str, Any]:
    """로컬 이벤트를 허브 계약 형태로 옮긴다."""
    payload: dict[str, Any] = dict(event.payload or {})
    for key, value in (
        ("method", event.method),
        ("path", event.path),
        ("ip_hash", event.ip_hash),
        ("service_version", settings.service_version),
    ):
        if value:
            payload[key] = value

    try:
        if len(json.dumps(payload, ensure_ascii=False, default=str)) > MAX_PAYLOAD_CHARS:
            payload = {"truncated": True, "keys": list(payload)[:40]}
    except Exception:  # noqa: BLE001
        payload = {"unserializable": True}

    hub: dict[str, Any] = {
        "event_id": event.event_id,
        "project_id": settings.mae_loghub_project_id,
        "environment": settings.loghub_environment,
        "tier": event.tier,
        "occurred_at": event.occurred_at.isoformat(),
        "kind": event.kind,
        "level": event.level,
    }
    if event.message:
        hub["message"] = event.message
    if event.trace_id:
        hub["trace_id"] = event.trace_id[:160]
    # 허브 계약: 원본 식별자 금지 — 사용자 ID 는 해시로만 보낸다.
    actor = hash_actor(event.user_id)
    if actor:
        hub["actor_hash"] = actor
    if event.source:
        hub["source"] = event.source[:80]
    if event.stack:
        hub["stack"] = event.stack[:20_000]
    if event.status_code is not None:
        hub["status_code"] = event.status_code
    if event.duration_ms is not None:
        hub["duration_ms"] = event.duration_ms
    if payload:
        hub["payload"] = payload
    return hub


def enqueue(event: AppLogEvent) -> None:
    """이벤트를 전송 큐에 넣는다. 동기 반환이며 절대 예외를 던지지 않는다."""
    global _dropped
    try:
        if not is_enabled():
            return
        if len(_buffer) >= BUFFER_LIMIT:
            # 오래된 것부터 버린다 — 최신 오류를 살리는 편이 진단에 유리하다.
            _buffer.pop(0)
            _dropped += 1
        _buffer.append(to_hub_event(event))
        if len(_buffer) >= BATCH_SIZE:
            _schedule_immediate_flush()
    except Exception:  # noqa: BLE001
        pass


def _schedule_immediate_flush() -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # 이벤트 루프 밖(테스트 등) — 주기 플러시가 처리한다.
    loop.create_task(flush())


def _sign(body: bytes) -> dict[str, str]:
    project_id = settings.mae_loghub_project_id
    timestamp = str(int(time.time() * 1000))
    nonce = base64.urlsafe_b64encode(secrets.token_bytes(12)).decode().rstrip("=")
    body_hash = hashlib.sha256(body).hexdigest()
    signature = hmac.new(
        settings.mae_loghub_key.encode("utf-8"),
        f"{project_id}\n{timestamp}\n{nonce}\n{body_hash}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
        "x-mae-project": project_id,
        "x-mae-timestamp": timestamp,
        "x-mae-nonce": nonce,
        "x-mae-signature": signature,
    }


async def flush() -> None:
    """버퍼를 허브로 밀어낸다. 실패는 흡수하고 서킷을 연다."""
    global _in_flight, _consecutive_failures, _circuit_open_until, _dropped, _last_warn_at
    if not is_enabled() or _in_flight or not _buffer:
        return
    if time.time() < _circuit_open_until:
        return

    _in_flight = True
    batch = _buffer[:MAX_BATCH]
    del _buffer[: len(batch)]
    try:
        body = json.dumps({"events": batch}, ensure_ascii=False, default=str).encode("utf-8")
        from app.core.outbound import assert_safe_egress_url

        base = assert_safe_egress_url(settings.mae_loghub_url.rstrip("/"))
        async with httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_SEC, follow_redirects=False
        ) as client:
            response = await client.post(
                f"{base}/v1/ingest", content=body, headers=_sign(body)
            )
        if response.status_code >= 400:
            raise RuntimeError(f"http_{response.status_code}: {response.text[:200]}")
        _warn_on_rejected(response)
        _consecutive_failures = 0
    except Exception as exc:  # noqa: BLE001
        _consecutive_failures += 1
        _dropped += len(batch)
        if _consecutive_failures >= CIRCUIT_FAILURE_THRESHOLD:
            _circuit_open_until = time.time() + CIRCUIT_OPEN_SEC
            _consecutive_failures = 0
        now = time.time()
        if now - _last_warn_at > 60:
            _last_warn_at = now
            logger.warning(
                "loghub_forward_failed",
                extra={"event": {"kind": "loghub.forward_failed",
                                 "error": str(exc)[:300], "dropped": _dropped}},
            )
    finally:
        _in_flight = False


def _warn_on_rejected(response: httpx.Response) -> None:
    """200 안의 부분 거절을 드러낸다 — 조용히 넘기면 관측이 통째로 사라진다."""
    global _dropped, _last_reject_warn_at
    try:
        result = response.json()
    except Exception:  # noqa: BLE001
        return
    rejected = result.get("rejected") if isinstance(result, dict) else None
    if not rejected:
        return
    _dropped += len(rejected)
    now = time.time()
    if now - _last_reject_warn_at <= 60:
        return
    _last_reject_warn_at = now
    reasons = sorted({str(r.get("reason", "unknown")) for r in rejected})[:5]
    logger.warning(
        "loghub_events_rejected",
        extra={"event": {"kind": "loghub.events_rejected",
                         "count": len(rejected), "reasons": reasons}},
    )


async def _flush_loop() -> None:
    while True:
        await asyncio.sleep(FLUSH_INTERVAL_SEC)
        await flush()


def start_forwarder() -> None:
    """앱 기동 시 주기 플러시 태스크를 띄운다."""
    global _flush_task
    if not is_enabled() or _flush_task is not None:
        return
    try:
        _flush_task = asyncio.get_running_loop().create_task(_flush_loop())
        logger.info(
            "loghub_forwarder_started",
            extra={"event": {"kind": "loghub.started", **stats()}},
        )
    except RuntimeError:
        _flush_task = None


async def stop_forwarder() -> None:
    """종료 전에 남은 버퍼를 한 번 더 밀어낸다."""
    global _flush_task
    if _flush_task is not None:
        _flush_task.cancel()
        _flush_task = None
    await flush()
