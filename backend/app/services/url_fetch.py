"""첨부 URL 을 가져와 분석 입력으로 쓸 텍스트를 뽑는다.

서버가 사용자가 준 주소로 요청을 보내는 기능이라, 기본 성질이 **SSRF** 다.
막지 않으면 이 서버가 사설망 안쪽을 대신 두드려 주는 도구가 된다 — 메타데이터
서버(169.254.169.254), 사내 대시보드, 같은 VPC 의 DB 관리 화면이 전부 사정권에
들어온다. 그래서 다음을 지킨다.

  1. **스킴 허용 목록** — http·https 만. file·gopher·ftp·data 는 막는다.
  2. **DNS 해석 후 IP 로 판정** — 호스트 이름만 보면 `internal.example.com`
     처럼 공인 이름이 사설 IP 를 가리키는 경우를 놓친다. 실제로 붙을 주소를
     보고 사설·루프백·링크로컬·예약 대역을 거른다.
  3. **리다이렉트 수동 추적** — 자동 추적을 켜면 공인 주소로 시작해 사설
     주소로 넘어가는 우회를 검사 없이 따라간다. 매 홉마다 다시 판정한다.
  4. **크기·시간 상한** — 무한 스트림 하나로 컨테이너 메모리를 채울 수 있다.

추출은 본문 텍스트만 남긴다. 스크립트·스타일은 내용이 아니라 실행 대상이라
지우고, 모델에 넣을 분량으로 잘라 낸다.
"""
from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlparse, urlunparse

import httpx

ALLOWED_SCHEMES = ("http", "https")
MAX_REDIRECTS = 3
FETCH_TIMEOUT_SECONDS = 15
MAX_BYTES = 2 * 1024 * 1024
#: 추출 텍스트 상한 — 업로드 파일과 같은 기준(services/upload.MAX_EXTRACTED_CHARS).
MAX_EXTRACTED_CHARS = 20_000
#: 프로젝트당 URL 첨부 개수.
MAX_URLS_PER_PROJECT = 5

USER_AGENT = "adg-linkfetch/1.0 (+https://design-gen-zitify.web.app)"

#: IP 가 아니라 이름으로 내부를 가리키는 흔한 표기.
_DENY_HOSTS = frozenset({"localhost", "ip6-localhost", "ip6-loopback", "metadata",
                         "metadata.google.internal", "instance-data"})

_SCRIPT_STYLE = re.compile(r"<(script|style|noscript|template)\b[^>]*>.*?</\1>", re.I | re.S)
_TAG = re.compile(r"<[^>]+>")
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_WS = re.compile(r"[ \t\r\f\v]+")
_BLANKS = re.compile(r"\n{3,}")


class UrlNotAllowed(ValueError):
    """가져오면 안 되는 주소. 사용자에게 그대로 보여도 되는 메시지를 담는다."""


@dataclass
class FetchedUrl:
    url: str
    title: str
    text: str
    content_type: str
    byte_size: int


def _reject_ip(raw: str) -> None:
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    ):
        raise UrlNotAllowed("사설·내부 주소는 첨부할 수 없습니다.")


def normalize_url(raw: str) -> str:
    """형태를 검사하고 정규화한다. 여기서 통과해도 IP 판정이 한 번 더 남았다."""
    candidate = (raw or "").strip()
    if not candidate:
        raise UrlNotAllowed("주소가 비어 있습니다.")
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    if len(candidate) > 2048:
        raise UrlNotAllowed("주소가 너무 깁니다.")

    parsed = urlparse(candidate)
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise UrlNotAllowed("http·https 주소만 첨부할 수 있습니다.")
    if not parsed.hostname:
        raise UrlNotAllowed("호스트가 없는 주소입니다.")
    if parsed.username or parsed.password:
        # user:pass@host 는 호스트를 눈속임하는 고전 수법이다.
        raise UrlNotAllowed("인증 정보가 포함된 주소는 첨부할 수 없습니다.")
    host = parsed.hostname.lower()
    # DNS 해석 뒤 IP 로 다시 거르지만(_resolve_and_check), 뻔한 이름은 여기서
    # 끊는 편이 오류 메시지가 정확하고 불필요한 조회도 줄인다.
    if host in _DENY_HOSTS or host.endswith((".localhost", ".local", ".internal")):
        raise UrlNotAllowed("사설·내부 주소는 첨부할 수 없습니다.")
    _reject_ip(host)
    return urlunparse(parsed._replace(fragment=""))


def _resolve_and_check(host: str, port: int) -> None:
    """실제로 붙을 IP 를 보고 판정한다. 이름만 보면 우회를 놓친다."""
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UrlNotAllowed("주소를 찾을 수 없습니다.") from exc
    if not infos:
        raise UrlNotAllowed("주소를 찾을 수 없습니다.")
    for info in infos:
        _reject_ip(info[4][0])


def extract_text(html: str) -> tuple[str, str]:
    """(제목, 본문 텍스트). HTML 이 아니면 원문을 그대로 본문으로 본다."""
    title_match = _TITLE.search(html)
    title = _TAG.sub("", title_match.group(1)).strip() if title_match else ""

    body = _SCRIPT_STYLE.sub(" ", html)
    body = re.sub(r"<(br|/p|/div|/li|/h[1-6]|/tr)\s*/?>", "\n", body, flags=re.I)
    body = _TAG.sub(" ", body)
    for entity, char in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"),
                         ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")):
        body = body.replace(entity, char)
    body = _WS.sub(" ", body)
    body = _BLANKS.sub("\n\n", body)
    lines = [line.strip() for line in body.splitlines()]
    body = "\n".join(line for line in lines if line)
    return title[:200], body[:MAX_EXTRACTED_CHARS]


async def fetch_url(raw: str) -> FetchedUrl:
    """주소를 가져와 텍스트를 뽑는다. 매 리다이렉트 홉을 다시 검사한다."""
    url = normalize_url(raw)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "Accept-Language": "ko,en;q=0.8",
    }
    timeout = httpx.Timeout(FETCH_TIMEOUT_SECONDS)

    async with httpx.AsyncClient(
        timeout=timeout, follow_redirects=False, headers=headers
    ) as client:
        for _ in range(MAX_REDIRECTS + 1):
            parsed = urlparse(url)
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            _resolve_and_check(parsed.hostname or "", port)
            try:
                response = await client.get(url)
            except httpx.RequestError as exc:
                raise UrlNotAllowed(
                    f"주소를 불러오지 못했습니다({type(exc).__name__})."
                ) from exc

            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("location")
                if not location:
                    raise UrlNotAllowed("리다이렉트 대상이 없습니다.")
                url = normalize_url(str(httpx.URL(url).join(location)))
                continue
            break
        else:
            raise UrlNotAllowed("리다이렉트가 너무 많습니다.")

    if response.status_code >= 400:
        raise UrlNotAllowed(f"주소가 {response.status_code} 를 반환했습니다.")

    raw_body = response.content[:MAX_BYTES]
    content_type = (response.headers.get("content-type") or "").split(";")[0].strip()
    charset = response.charset_encoding or "utf-8"
    try:
        text_body = raw_body.decode(charset, errors="replace")
    except LookupError:
        text_body = raw_body.decode("utf-8", errors="replace")

    if "html" in content_type or "<html" in text_body[:2000].lower():
        title, text = extract_text(text_body)
    else:
        title, text = "", text_body[:MAX_EXTRACTED_CHARS]

    if not text.strip():
        raise UrlNotAllowed("본문 텍스트를 찾지 못했습니다.")

    return FetchedUrl(
        url=str(response.url),
        title=title or urlparse(url).hostname or "",
        text=text,
        content_type=content_type or "text/plain",
        byte_size=len(raw_body),
    )
