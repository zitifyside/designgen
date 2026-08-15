"""크롤 함정(L7) IP 차단 — 프로세스 메모리, 24시간.

인스턴스가 하나인 현 구성(`--max-instances 1`)에서 유효하다.
다중 인스턴스로 늘리면 Redis 로 옮긴다.
"""
from __future__ import annotations

import time
from collections import OrderedDict

BAN_SECONDS = 86_400
_MAX_ENTRIES = 20_000
_bans: OrderedDict[str, float] = OrderedDict()


def _sweep(now: float) -> None:
    while _bans:
        ip, until = next(iter(_bans.items()))
        if until > now:
            break
        _bans.popitem(last=False)
    while len(_bans) > _MAX_ENTRIES:
        _bans.popitem(last=False)


def ban_ip(ip: str, seconds: int = BAN_SECONDS) -> None:
    if not ip or ip in {"unknown", "testclient"}:
        return
    now = time.time()
    _sweep(now)
    _bans[ip] = now + seconds
    _bans.move_to_end(ip)


def is_banned(ip: str) -> bool:
    if not ip:
        return False
    until = _bans.get(ip)
    if until is None:
        return False
    if time.time() >= until:
        _bans.pop(ip, None)
        return False
    return True


__all__ = ["BAN_SECONDS", "ban_ip", "is_banned"]
