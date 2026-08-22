"""마에 3채널: Antigravity · Codex · Claude.

**세 채널을 동시에 쓴다.** 예전에는 사다리였다 — antigravity 를 부르고, 실패하면
codex, 또 실패하면 claude. 그 방식은 앞 채널이 죽어 있을 때 그 죽는 시간을 매번
치른다. agy 로그인이 풀렸던 날 실제로 그랬다: 모든 호출이 antigravity 의 실패를
기다린 뒤에야 codex 로 내려갔다.

지금은 할 일의 개수에 따라 두 가지로 갈라 쓴다.

  · **일이 하나면 경주한다.** 세 채널에 같은 요청을 동시에 던지고 가장 먼저
    성공한 답을 쓴 뒤 나머지를 취소한다. 죽은 채널은 즉시 떨어져 나가므로
    기다림이 사라지고, 살아 있는 채널 중 가장 빠른 것이 답을 준다.
  · **일이 여럿이면 나눠 맡는다.** 시안 6장이면 세 채널이 2장씩 **서로 다른**
    일을 동시에 한다. 같은 일을 셋이 하는 것(경주)은 여기서 낭비다 — 벽시계
    시간이 채널 수만큼 줄어드는 쪽이 훨씬 크다.

경주는 호출 수를 채널 수만큼 늘린다. 구독이라 금액은 늘지 않지만 세션·시간당
쿼터는 그만큼 빨리 닳는다. 그게 싫으면 `MAE_DISPATCH=ladder` 로 예전 방식으로
되돌릴 수 있다.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.core.config import settings
from app.services.ai.antigravity import AntigravityProvider
from app.services.ai.base import AIProvider
from app.services.ai.claude_cli import ClaudeCliProvider
from app.services.ai.codex import CodexProvider
from app.services.ai.mae_cli import (
    mae_channels_available,
    record_mae_channel_async as record_mae_channel,
)


class MaeLadderProvider(AIProvider):
    name = "mae"

    def __init__(self) -> None:
        raw = (settings.mae_ladder or "antigravity,codex,claude").split(",")
        self.order = [c.strip().lower() for c in raw if c.strip()]
        available = set(mae_channels_available())
        self.order = [c for c in self.order if c in available]
        if not self.order:
            raise RuntimeError(
                "마에 CLI(antigravity·codex·claude) 를 하나도 찾지 못했습니다."
            )
        self._factories = {
            "antigravity": AntigravityProvider,
            "codex": CodexProvider,
            "claude": ClaudeCliProvider,
        }
        self.parallel = (settings.mae_dispatch or "parallel").strip().lower() != "ladder"

    def _make(self, channel: str) -> AIProvider:
        return self._factories[channel]()

    # ── 단건: 경주 ────────────────────────────────────────────────
    async def _race(self, op: str, *args: Any) -> Any:
        """세 채널에 같은 요청을 던지고 첫 성공을 쓴다."""
        tasks = {
            asyncio.create_task(getattr(self._make(channel), op)(*args)): channel
            for channel in self.order
        }
        errors: list[str] = []
        try:
            pending = set(tasks)
            while pending:
                done, pending = await asyncio.wait(
                    pending, return_when=asyncio.FIRST_COMPLETED
                )
                for task in done:
                    channel = tasks[task]
                    try:
                        result = task.result()
                    except Exception as exc:  # noqa: BLE001
                        errors.append(f"{channel}: {exc}")
                        record_mae_channel(channel, False, str(exc))
                        continue
                    record_mae_channel(channel, True)
                    return result
        finally:
            # 이긴 답을 얻었으면 남은 CLI 는 더 돌 이유가 없다. 놔두면 구독
            # 쿼터를 계속 먹고, 프로세스도 남는다.
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        raise RuntimeError("마에 CLI 3채널이 모두 실패했다. " + " | ".join(errors))

    async def _ladder(self, op: str, *args: Any) -> Any:
        """예전 방식 — 순서대로 부르고 실패하면 다음으로."""
        errors: list[str] = []
        for channel in self.order:
            try:
                result = await getattr(self._make(channel), op)(*args)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{channel}: {exc}")
                record_mae_channel(channel, False, str(exc))
                continue
            record_mae_channel(channel, True)
            return result
        raise RuntimeError("마에 CLI 사다리가 모두 실패했다. " + " | ".join(errors))

    async def _across(self, op: str, *args: Any) -> Any:
        if self.parallel and len(self.order) > 1:
            return await self._race(op, *args)
        return await self._ladder(op, *args)

    # ── 파이프라인 단계 ────────────────────────────────────────────
    async def analyze_input(self, requirements: str, platform: str) -> dict[str, Any]:
        return await self._across("analyze_input", requirements, platform)

    async def generate_concepts(self, analysis: dict[str, Any], n: int) -> list[dict[str, Any]]:
        return await self._across("generate_concepts", analysis, n)

    async def generate_layouts(self, concept: dict[str, Any], variants: int) -> list[dict[str, Any]]:
        return await self._across("generate_layouts", concept, variants)

    async def render(self, layout: dict[str, Any], tokens: dict[str, Any]) -> dict[str, Any]:
        # 사다리를 그대로 탄다. 여기만 no-op 으로 두면 로컬 기본 provider 에서
        # Stage 4 가 통째로 빠져 시안이 컨셉 보드로 되돌아간다.
        return await self._across("render", layout, tokens)

    # ── 다건: 나눠 맡기 ───────────────────────────────────────────
    async def render_batch(
        self, layouts: list[dict[str, Any]], tokens: dict[str, Any]
    ) -> list[dict[str, Any] | None]:
        """시안 여러 장을 채널에 나눠 동시에 그린다.

        여기서 경주를 쓰면 세 채널이 **같은** 한 장을 그리느라 나머지 다섯 장이
        기다린다. 서로 다른 장을 맡기는 편이 벽시계 시간을 채널 수만큼 줄인다 —
        6장 순차 39분이 이 지점의 문제였다.

        맡은 채널이 실패한 장은 다른 채널로 한 번 더 시도한다. 나눠 맡기는 것이
        속도를 위한 배분이지 단일 실패점을 만드는 일은 아니어야 한다.

        실패한 자리는 None 이다 — 호출 쪽이 Fallback 으로 표시한다.
        """
        if not layouts:
            return []
        if not self.parallel or len(self.order) <= 1:
            results: list[dict[str, Any] | None] = []
            for layout in layouts:
                try:
                    results.append(await self.render(layout, tokens))
                except Exception:  # noqa: BLE001
                    results.append(None)
            return results

        async def one(index: int, layout: dict[str, Any]) -> dict[str, Any] | None:
            primary = self.order[index % len(self.order)]
            # 맡은 채널부터, 실패하면 나머지를 순서대로.
            for channel in [primary] + [c for c in self.order if c != primary]:
                try:
                    result = await getattr(self._make(channel), "render")(layout, tokens)
                except Exception as exc:  # noqa: BLE001
                    record_mae_channel(channel, False, str(exc))
                    continue
                record_mae_channel(channel, True)
                return result
            return None

        return list(
            await asyncio.gather(
                *(one(i, layout) for i, layout in enumerate(layouts))
            )
        )

    # ── 파이프라인 밖 ─────────────────────────────────────────────
    async def complete_json(
        self, system_prompt: str, payload: dict[str, Any], schema: dict[str, Any]
    ) -> dict[str, Any]:
        """파이프라인 4단계에 속하지 않는 일회성 JSON 요청.

        4단계는 프롬프트가 코드에 고정돼 있지만, 이건 호출 쪽이 프롬프트와
        스키마를 들고 온다. 채널마다 `_complete` 시그니처가 조금 달라(codex 만
        schema_name 을 더 받는다) 그 차이를 여기서 흡수한다.
        """

        async def call(channel: str) -> dict[str, Any]:
            provider = self._make(channel)
            if channel == "codex":
                return await provider._complete(
                    system_prompt, payload, schema=schema, schema_name="autofill"
                )
            return await provider._complete(system_prompt, payload, schema=schema)

        if not self.parallel or len(self.order) <= 1:
            errors: list[str] = []
            for channel in self.order:
                try:
                    result = await call(channel)
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{channel}: {exc}")
                    record_mae_channel(channel, False, str(exc))
                    continue
                record_mae_channel(channel, True)
                return result
            raise RuntimeError("마에 CLI 사다리가 모두 실패했다. " + " | ".join(errors))

        tasks = {asyncio.create_task(call(c)): c for c in self.order}
        errors = []
        try:
            pending = set(tasks)
            while pending:
                done, pending = await asyncio.wait(
                    pending, return_when=asyncio.FIRST_COMPLETED
                )
                for task in done:
                    channel = tasks[task]
                    try:
                        result = task.result()
                    except Exception as exc:  # noqa: BLE001
                        errors.append(f"{channel}: {exc}")
                        record_mae_channel(channel, False, str(exc))
                        continue
                    record_mae_channel(channel, True)
                    return result
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        raise RuntimeError("마에 CLI 3채널이 모두 실패했다. " + " | ".join(errors))
