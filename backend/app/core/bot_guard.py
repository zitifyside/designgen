"""크롤러·AI 학습 봇 UA 차단 (OP-05 L3).

검색·AI·SEO·아카이브·헤드리스만 막는다. Public API·스모크·MCP 가 쓰는
httpx·curl·node fetch 는 막지 않는다.
한국 인앱 브라우저(카카오톡·네이버·라인·인스타·페북·다음)는 통과한다.
"""
from __future__ import annotations

import re

from fastapi import Request
from fastapi.responses import JSONResponse

# 헬스·루트는 프로브가 들어오므로 UA 를 보지 않는다.
SKIP_PATHS = frozenset({"/", "/docs", "/redoc", "/openapi.json"})

INAPP_RE = re.compile(
    r"KakaoTalk/|KAKAOTALK\s|NAVER\(inapp|Instagram\s+\d|FBAN/|FBIOS|"
    r"Line/\d|Daum/\d",
    re.I,
)

# 일반 bot/ 토큰 + 명시 봇. curl·httpx·python-requests 는 제외.
BLOCKED_BOT_RE = re.compile(
    r"""
    \bbot[/;)] |
    \bcrawler\b | \bspider\b | \bscraper\b | \barchiver\b | \bindexer\b |
    googlebot | bingbot | yandex | baiduspider | sogou | \byeti\b | naverbot |
    daumoa | applebot |
    GPTBot | CCBot | ClaudeBot | claude-web | anthropic-ai | PerplexityBot |
    ChatGPT-User | OAI-SearchBot | Google-Extended | Bytespider | Amazonbot |
    Meta-ExternalAgent | ImagesiftBot | FacebookBot | cohere-training |
    MistralAI-User | Applebot-Extended | KagiBot | YouBot | AndiBot |
    TimpiBot | PrismBot | Webzio-Extended |
    AhrefsBot | SemrushBot | MJ12bot | DotBot | BLEXBot |
    facebookexternalhit | twitterbot | linkedinbot | slackbot | discordbot |
    telegrambot | kakaotalk-scrap |
    archive\.org | wayback | feedfetcher |
    headlesschrome | phantomjs | puppeteer | playwright | selenium |
    chrome-lighthouse |
    scrapy | nmap | sqlmap | nikto | acunetix | burpsuite | wpscan
    """,
    re.I | re.X,
)


def is_blocked_bot(user_agent: str | None) -> bool:
    ua = user_agent or ""
    if INAPP_RE.search(ua):
        return False
    return bool(BLOCKED_BOT_RE.search(ua))


def enforce_bot_guard(request: Request) -> JSONResponse | None:
    path = request.url.path
    if path in SKIP_PATHS or path.endswith("/health"):
        return None
    if request.method == "OPTIONS":
        return None
    ua = request.headers.get("user-agent")
    if not (ua or "").strip():
        return JSONResponse(
            status_code=403,
            content={"detail": "접근이 거부되었습니다."},
            headers={
                "X-Content-Type-Options": "nosniff",
                "Retry-After": "86400",
                "Cache-Control": "public, max-age=3600",
                "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
            },
        )
    if not is_blocked_bot(ua):
        return None
    return JSONResponse(
        status_code=403,
        content={"detail": "접근이 거부되었습니다."},
        headers={
            "X-Content-Type-Options": "nosniff",
            "Retry-After": "86400",
            "Cache-Control": "public, max-age=3600",
            "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        },
    )
