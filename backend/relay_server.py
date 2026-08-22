"""마에 CLI 사다리 릴레이 — 운영 Cloud Run 이 구독 CLI 를 쓰게 하는 다리.

왜 필요한가. Antigravity(`agy`)·Codex·Claude 는 운영자 PC 에 대화형으로
로그인된 **구독 CLI** 다. 운영 컨테이너는 `python:3.11-slim` 리눅스라
PowerShell 도 `D:\\` 드라이브도 그 로그인 세션도 없다. 그래서 CLI 를
컨테이너로 옮기는 대신, CLI 가 있는 곳에 얇은 HTTP 문을 내고 컨테이너가
그 문을 두드리게 한다.

  Cloud Run(adg-api) ──HTTPS──▶ Cloudflare Tunnel ──▶ 이 릴레이(127.0.0.1)
                                                          └─▶ mae 사다리
                                                               (agy → codex → claude)

이미 운영 DB 가 같은 경로(터널 → 이 PC)를 쓰고 있으므로 새로운 종속을
만드는 것이 아니라 이미 있는 종속에 하나를 얹는 것이다.

**바깥에 열리는 문이라 다음 셋을 지킨다.**

  1. 루프백에만 바인딩한다. 인터넷 노출은 오직 터널을 통해서만 일어나고,
     터널은 Cloudflare 가 인증을 한 겹 더 건다.
  2. 공유 토큰을 상수 시간 비교로 검사한다. 토큰이 없으면 **기동을 거부**한다 —
     인증 없이 뜬 LLM 엔드포인트는 남의 구독으로 남의 일을 해 주는 창구가 된다.
  3. 허용한 연산(op) 이름만 받는다. 문자열로 받은 이름을 그대로
     `getattr` 에 넘기면 provider 의 아무 속성이나 부를 수 있다.

실행:
    set ADG_RELAY_TOKEN=<토큰>
    python -m uvicorn relay_server:app --host 127.0.0.1 --port 19330
"""
from __future__ import annotations

import hmac
import logging
import os
import time
from typing import Any

from fastapi import Body, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.services.ai.mae_cli import mae_channels_available
from app.services.ai.mae_ladder import MaeLadderProvider

logger = logging.getLogger("adg.relay")

#: 릴레이가 대신 불러 주는 연산. 파이프라인 4단계 그대로이며 이 밖은 거절한다.
ALLOWED_OPS = frozenset(
    {"analyze_input", "generate_concepts", "generate_layouts", "render"}
)

TOKEN_ENV = "ADG_RELAY_TOKEN"


def _expected_token() -> str:
    token = (os.environ.get(TOKEN_ENV) or "").strip()
    if len(token) < 32:
        raise RuntimeError(
            f"{TOKEN_ENV} 가 없거나 너무 짧습니다(32자 이상). "
            "인증 없는 릴레이는 띄우지 않는다."
        )
    return token


class StageRequest(BaseModel):
    op: str = Field(description="파이프라인 연산 이름")
    args: list[Any] = Field(default_factory=list, description="그 연산의 위치 인자")


app = FastAPI(
    title="ADG mae relay",
    docs_url=None,          # 문서 페이지를 열어 둘 이유가 없다.
    redoc_url=None,
    openapi_url=None,
)


@app.on_event("startup")
async def _check_startup() -> None:
    _expected_token()  # 토큰이 없으면 여기서 죽는다.
    channels = mae_channels_available()
    if not channels:
        logger.warning("사용 가능한 마에 채널이 없다 — 요청은 전부 503 이 된다.")
    logger.info("relay ready. channels=%s", ",".join(channels) or "(none)")


def _authorize(authorization: str | None) -> None:
    expected = _expected_token()
    supplied = ""
    if authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    # 길이 차이로 토큰을 알아내지 못하도록 상수 시간 비교를 쓴다.
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized"
        )


@app.get("/health")
async def health() -> dict[str, Any]:
    """터널·기동 확인용. 토큰 없이 열어 두되 아무것도 흘리지 않는다."""
    return {"status": "ok", "channels": len(mae_channels_available())}


@app.get("/v1/status")
async def relay_status(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _authorize(authorization)
    return {"status": "ok", "channels": mae_channels_available()}


@app.post("/v1/stage")
async def run_stage(
    body: StageRequest = Body(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _authorize(authorization)

    if body.op not in ALLOWED_OPS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"unknown op: {body.op}"
        )

    try:
        provider = MaeLadderProvider()
    except RuntimeError as exc:
        # CLI 가 하나도 없으면 그건 릴레이의 잘못이 아니라 이 PC 의 상태다.
        # 503 으로 알려 호출 쪽이 재시도·폴백을 판단하게 한다.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    started = time.monotonic()
    try:
        result = await getattr(provider, body.op)(*body.args)
    except Exception as exc:  # noqa: BLE001 — 호출 쪽이 재시도로 판단한다.
        logger.warning("stage %s failed: %s", body.op, str(exc)[:300])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)[:500]
        ) from exc

    elapsed = round(time.monotonic() - started, 2)
    logger.info("stage %s ok in %ss", body.op, elapsed)
    # 단계마다 반환 타입이 다르다(dict·list). 감싸서 형태를 하나로 만든다.
    return {"result": result, "elapsedSeconds": elapsed}
