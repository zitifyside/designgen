"""발신 URL 검증 — SSRF 차단 (체크리스트·취약점_외부요청_SSRF_발신보안).

운영자가 넣는 허브 URL 도 같은 규칙을 탄다. 설정 오타가
메타데이터 서버로 나가지 않게 한다.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

_BLOCKED_HOSTS = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "169.254.169.254",
    "metadata.google.internal",
    "metadata",
}


def _is_private_ip(value: str) -> bool:
    try:
        addr = ipaddress.ip_address(value.split("%")[0].replace("::ffff:", ""))
    except ValueError:
        return False
    return bool(
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def assert_safe_egress_url(raw: str, *, resolve: bool = True) -> str:
    """https 만 허용하고 사설·링크로컬·메타데이터 호스트를 거절한다."""
    parsed = urlparse((raw or "").strip())
    if parsed.scheme != "https":
        raise ValueError("egress_https_only")
    host = (parsed.hostname or "").lower()
    if not host or host in _BLOCKED_HOSTS:
        raise ValueError("egress_blocked_host")
    if _is_private_ip(host):
        raise ValueError("egress_private_ip")
    if not resolve:
        return raw
    try:
        infos = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("egress_resolve_failed") from exc
    for info in infos:
        ip = info[4][0]
        if _is_private_ip(ip):
            raise ValueError("egress_resolved_private")
    return raw


__all__ = ["assert_safe_egress_url"]
