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

**호출은 비동기 잡으로 받는다.** Cloudflare 는 프록시 뒤 origin 이 100초
안에 응답하지 않으면 524 로 끊는다. 그런데 Stage 3·4 는 분 단위다. 그래서
`POST /v1/stage` 는 잡을 만들고 즉시 id 만 돌려주고, 호출 쪽이
`GET /v1/job/{id}` 로 물어본다. 매 HTTP 왕복이 짧아지므로 100초 벽에
걸리지 않는다. 동기로 두면 터널을 지나는 순간 긴 작업이 전부 실패한다.

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

import asyncio
import base64
import hmac
import logging
import os
import time
import uuid
from typing import Any

from fastapi import Body, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.services.ai.image_cli import available_channels as image_channels
from app.services.ai.image_cli import generate_image
from app.services.ai.mae_cli import mae_channels_available
from app.services.ai.mae_ladder import MaeLadderProvider

logger = logging.getLogger("adg.relay")

#: 릴레이가 대신 불러 주는 연산. 파이프라인 4단계 그대로이며 이 밖은 거절한다.
ALLOWED_OPS = frozenset(
    {
        "analyze_input",
        "generate_concepts",
        "generate_layouts",
        "render",
        "render_batch",
        # 파이프라인 밖의 일회성 JSON 요청(개발용 자동 입력). 프롬프트·스키마를
        # 호출 쪽이 들고 오지만, 부를 수 있는 이름은 여전히 이 목록에 갇힌다.
        "complete_json",
    }
)

TOKEN_ENV = "ADG_RELAY_TOKEN"

#: 끝난 잡을 이만큼 붙들었다가 버린다. 호출 쪽이 결과를 가져갈 시간이면 충분하고,
#: 무한히 쌓아 두면 페이지 HTML 이 든 결과가 메모리를 채운다.
JOB_TTL_SECONDS = 900
#: 한 잡이 이 시간을 넘기면 포기한다. 사다리 3채널 × Stage 4 최악을 감안한 값.
JOB_MAX_SECONDS = 3600

_jobs: dict[str, dict[str, Any]] = {}


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


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    aspect: str = Field(default="16:9", max_length=10)


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
    images = image_channels()
    logger.info(
        "relay ready. text=%s image=%s",
        ",".join(channels) or "(none)",
        ",".join(images) or "(none)",
    )


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
    return {
        "status": "ok",
        "channels": len(mae_channels_available()),
        "imageChannels": len(image_channels()),
    }


@app.get("/v1/status")
async def relay_status(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _authorize(authorization)
    return {
        "status": "ok",
        "channels": mae_channels_available(),
        "imageChannels": image_channels(),
    }


def _sweep_jobs() -> None:
    """끝난 지 오래된 잡을 버린다. 결과에 페이지 HTML 이 들어 크다."""
    now = time.monotonic()
    stale = [
        key
        for key, job in _jobs.items()
        if job["status"] != "running" and now - job["finishedAt"] > JOB_TTL_SECONDS
    ]
    for key in stale:
        _jobs.pop(key, None)


async def _run_job(job_id: str, op: str, args: list[Any]) -> None:
    job = _jobs[job_id]
    started = time.monotonic()
    try:
        provider = MaeLadderProvider()
        result = await asyncio.wait_for(
            getattr(provider, op)(*args), timeout=JOB_MAX_SECONDS
        )
    except Exception as exc:  # noqa: BLE001 — 실패도 잡의 정상적인 끝이다.
        job.update(
            status="failed",
            error=str(exc)[:2000],
            finishedAt=time.monotonic(),
            elapsedSeconds=round(time.monotonic() - started, 2),
        )
        logger.warning("job %s (%s) failed: %s", job_id, op, str(exc)[:300])
        return
    elapsed = round(time.monotonic() - started, 2)
    job.update(
        status="done", result=result, finishedAt=time.monotonic(), elapsedSeconds=elapsed
    )
    logger.info("job %s (%s) ok in %ss", job_id, op, elapsed)


@app.post("/v1/stage", status_code=status.HTTP_202_ACCEPTED)
async def run_stage(
    body: StageRequest = Body(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """잡을 시작하고 id 만 돌려준다. 결과는 `/v1/job/{id}` 로 가져간다."""
    _authorize(authorization)

    if body.op not in ALLOWED_OPS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"unknown op: {body.op}"
        )
    if not mae_channels_available():
        # CLI 가 하나도 없으면 그건 릴레이의 잘못이 아니라 이 PC 의 상태다.
        # 503 으로 알려 호출 쪽이 재시도·폴백을 판단하게 한다.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="사용 가능한 마에 CLI 채널이 없습니다.",
        )

    _sweep_jobs()
    job_id = uuid.uuid4().hex
    _jobs[job_id] = {
        "status": "running",
        "op": body.op,
        "startedAt": time.monotonic(),
        "finishedAt": 0.0,
    }
    # 응답을 기다리지 않고 뒤에서 돌린다 — 이 요청은 즉시 끝나야 100초 벽을
    # 넘지 않는다. 태스크 참조를 잡에 남겨 GC 가 중간에 걷어가지 않게 한다.
    _jobs[job_id]["task"] = asyncio.create_task(_run_job(job_id, body.op, body.args))
    logger.info("job %s (%s) started", job_id, body.op)
    return {"jobId": job_id, "status": "running"}


async def _run_image_job(job_id: str, prompt: str, aspect: str) -> None:
    job = _jobs[job_id]
    started = time.monotonic()
    try:
        made = await asyncio.wait_for(
            generate_image(prompt, aspect), timeout=JOB_MAX_SECONDS
        )
    except Exception as exc:  # noqa: BLE001 — 실패도 잡의 정상적인 끝이다.
        job.update(
            status="failed",
            error=str(exc)[:2000],
            finishedAt=time.monotonic(),
            elapsedSeconds=round(time.monotonic() - started, 2),
        )
        logger.warning("image job %s failed: %s", job_id, str(exc)[:300])
        return

    elapsed = round(time.monotonic() - started, 2)
    if made is None:
        # 채널을 다 돌았는데 그림이 없다. 호출 쪽이 그라디언트로 대신하도록
        # 실패로 알린다 — 여기서 조용히 빈 결과를 주면 원인이 사라진다.
        job.update(
            status="failed",
            error="모든 이미지 채널이 실패했습니다.",
            finishedAt=time.monotonic(),
            elapsedSeconds=elapsed,
        )
        logger.warning("image job %s produced nothing in %ss", job_id, elapsed)
        return

    data, mime = made
    job.update(
        status="done",
        # JSON 으로 오가야 하므로 base64 로 싣는다. 장당 1MB 안팎이라
        # 인코딩 부담보다 별도 전송 경로를 만드는 복잡도가 크다.
        result={"mime": mime, "base64": base64.b64encode(data).decode("ascii")},
        finishedAt=time.monotonic(),
        elapsedSeconds=elapsed,
    )
    logger.info("image job %s ok in %ss (%d bytes)", job_id, elapsed, len(data))


@app.post("/v1/image", status_code=status.HTTP_202_ACCEPTED)
async def run_image(
    body: ImageRequest = Body(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """이미지 한 장을 굽는 잡을 시작한다. 결과는 `/v1/job/{id}` 로 가져간다.

    한 장이 30~60초라 100초 벽 안쪽이지만, 채널 폴백까지 겹치면 넘어간다.
    LLM 단계와 같은 잡 구조를 쓰는 편이 안전하고 코드도 하나로 끝난다.
    """
    _authorize(authorization)
    if not image_channels():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="사용 가능한 이미지 채널이 없습니다(grok·codex).",
        )

    _sweep_jobs()
    job_id = uuid.uuid4().hex
    _jobs[job_id] = {
        "status": "running",
        "op": "image",
        "startedAt": time.monotonic(),
        "finishedAt": 0.0,
    }
    _jobs[job_id]["task"] = asyncio.create_task(
        _run_image_job(job_id, body.prompt, body.aspect)
    )
    logger.info("image job %s started (%s)", job_id, body.aspect)
    return {"jobId": job_id, "status": "running"}


@app.get("/v1/job/{job_id}")
async def get_job(
    job_id: str, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    _authorize(authorization)
    job = _jobs.get(job_id)
    if job is None:
        # 이미 버렸거나 없는 잡. 호출 쪽이 영원히 폴링하지 않도록 404 로 끊는다.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="unknown or expired job"
        )
    payload: dict[str, Any] = {"status": job["status"], "op": job["op"]}
    if job["status"] == "running":
        payload["elapsedSeconds"] = round(time.monotonic() - job["startedAt"], 1)
        return payload
    payload["elapsedSeconds"] = job.get("elapsedSeconds", 0)
    if job["status"] == "done":
        payload["result"] = job["result"]
    else:
        payload["error"] = job.get("error", "")
    return payload
