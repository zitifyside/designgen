"""릴레이 provider — 운영에서 마에 구독 CLI 사다리를 쓴다.

이 클래스는 계산을 하지 않는다. 파이프라인 4단계를 그대로 운영자 PC 의
릴레이(`relay_server.py`)에 넘기고 결과를 받아 온다. 프롬프트·스키마·
검증·살균은 전부 릴레이 쪽 provider 안에서 이미 끝난 상태로 온다 —
같은 코드베이스의 같은 모듈이기 때문이다.

왜 이 구조인가. 운영 컨테이너는 리눅스라 `agy`·`codex`·`claude` CLI 를
띄울 수 없다. CLI 를 컨테이너로 옮기는 대신 CLI 가 있는 곳으로 요청을
보낸다. 대가는 **PC 가 꺼져 있으면 생성이 멈춘다**는 것인데, 운영 DB 도
이미 같은 PC 의 터널을 통해 붙으므로 새 종속이 아니라 기존 종속의 연장이다.

Stage 4 는 페이지 한 벌을 그리느라 오래 걸린다. 타임아웃을 짧게 잡으면
멀쩡히 진행 중인 렌더를 끊고 Fallback 으로 떨어뜨리므로 넉넉히 준다.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.core.config import settings
from app.services.ai.base import AIProvider


class RelayProvider(AIProvider):
    name = "relay"

    def __init__(self) -> None:
        base = (settings.relay_url or "").strip().rstrip("/")
        if not base:
            raise RuntimeError("RELAY_URL 이 비어 있다 — 릴레이 주소가 필요하다.")
        if not settings.relay_token:
            raise RuntimeError("RELAY_TOKEN 이 비어 있다 — 인증 없이 부르지 않는다.")
        self._base = base

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {settings.relay_token}"}

    @staticmethod
    def _check(response: httpx.Response) -> None:
        if response.status_code == 401:
            raise RuntimeError("릴레이 인증 실패 — RELAY_TOKEN 이 어긋난다.")
        if response.status_code == 503:
            raise RuntimeError(f"릴레이에 사용 가능한 CLI 채널이 없다. {response.text[:200]}")
        if response.status_code >= 400:
            raise RuntimeError(
                f"릴레이 요청 실패 ({response.status_code}). {response.text[:300]}"
            )

    async def _call(self, op: str, *args: Any) -> Any:
        """잡을 걸고 끝날 때까지 물어본다.

        한 번의 HTTP 로 결과까지 받으면 편하지만, 터널 앞의 Cloudflare 가
        100초에 524 로 끊는다. Stage 3·4 는 그보다 오래 걸리므로 긴 작업이
        전부 실패한다. 그래서 왕복을 짧게 쪼갠다.
        """
        # 폴링 왕복 자체는 짧다. 여기서 길게 잡으면 다시 100초 벽에 닿는다.
        timeout = httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=10.0)
        deadline = time.monotonic() + float(settings.relay_timeout_seconds)

        async with httpx.AsyncClient(timeout=timeout, headers=self._headers()) as client:
            try:
                started = await client.post(
                    f"{self._base}/v1/stage", json={"op": op, "args": list(args)}
                )
            except httpx.RequestError as exc:
                # PC 가 꺼졌거나 터널이 끊긴 경우다. 원인을 그대로 올려
                # "렌더 3회 실패" 뒤에 숨지 않게 한다.
                raise RuntimeError(
                    f"릴레이에 닿지 못했다({type(exc).__name__}). "
                    "운영자 PC·터널·릴레이 서비스 상태를 확인하라."
                ) from exc
            self._check(started)
            job_id = started.json().get("jobId")
            if not job_id:
                raise RuntimeError("릴레이가 jobId 를 주지 않았다.")

            while True:
                if time.monotonic() > deadline:
                    raise RuntimeError(
                        f"릴레이 작업이 {settings.relay_timeout_seconds}초 안에 끝나지 않았다({op})."
                    )
                await asyncio.sleep(settings.relay_poll_seconds)
                try:
                    polled = await client.get(f"{self._base}/v1/job/{job_id}")
                except httpx.RequestError:
                    # 폴링 한 번 실패로 진행 중인 작업을 버리지 않는다. 터널은
                    # 재연결되고, 못 견디면 위의 deadline 이 끊는다.
                    continue
                if polled.status_code == 404:
                    raise RuntimeError("릴레이가 작업을 잃었다(재기동 또는 만료).")
                self._check(polled)
                body = polled.json()
                state = body.get("status")
                if state == "running":
                    continue
                if state == "done":
                    return body.get("result")
                raise RuntimeError(f"릴레이 단계 실패({op}). {str(body.get('error'))[:400]}")

    # ── 파이프라인 단계 ────────────────────────────────────────────
    async def analyze_input(self, requirements: str, platform: str) -> dict[str, Any]:
        return await self._call("analyze_input", requirements, platform)

    async def generate_concepts(
        self, analysis: dict[str, Any], n: int
    ) -> list[dict[str, Any]]:
        return await self._call("generate_concepts", analysis, n)

    async def generate_layouts(
        self, concept: dict[str, Any], variants: int
    ) -> list[dict[str, Any]]:
        return await self._call("generate_layouts", concept, variants)

    async def render(
        self, layout: dict[str, Any], tokens: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._call("render", layout, tokens)

    # ── 파이프라인 밖 ──────────────────────────────────────────────
    async def complete_json(
        self, system_prompt: str, payload: dict[str, Any], schema: dict[str, Any]
    ) -> dict[str, Any]:
        """일회성 JSON 요청(자동 입력 등)을 사다리에 태운다."""
        return await self._call("complete_json", system_prompt, payload, schema)
