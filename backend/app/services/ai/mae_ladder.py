"""마에 제공 3채널 사다리: Antigravity → Codex → Claude.

한 단계가 실패하면 다음 채널로 넘기고, 마에 오케 레저에 성공·실패를 남긴다.
"""
from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.ai.antigravity import AntigravityProvider
from app.services.ai.base import AIProvider
from app.services.ai.claude_cli import ClaudeCliProvider
from app.services.ai.codex import CodexProvider
from app.services.ai.mae_cli import mae_channels_available, record_mae_channel


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

    def _make(self, channel: str) -> AIProvider:
        return self._factories[channel]()

    async def _across(self, op: str, *args: Any) -> Any:
        errors: list[str] = []
        for channel in self.order:
            provider = self._make(channel)
            try:
                result = await getattr(provider, op)(*args)
            except Exception as exc:  # noqa: BLE001
                msg = f"{channel}: {exc}"
                errors.append(msg)
                record_mae_channel(channel, False, str(exc))
                continue
            record_mae_channel(channel, True)
            return result
        raise RuntimeError("마에 CLI 사다리가 모두 실패했다. " + " | ".join(errors))

    async def analyze_input(self, requirements: str, platform: str) -> dict[str, Any]:
        return await self._across("analyze_input", requirements, platform)

    async def generate_concepts(self, analysis: dict[str, Any], n: int) -> list[dict[str, Any]]:
        return await self._across("generate_concepts", analysis, n)

    async def generate_layouts(self, concept: dict[str, Any], variants: int) -> list[dict[str, Any]]:
        return await self._across("generate_layouts", concept, variants)

    async def complete_json(
        self, system_prompt: str, payload: dict[str, Any], schema: dict[str, Any]
    ) -> dict[str, Any]:
        """파이프라인 4단계에 속하지 않는 일회성 JSON 요청을 사다리로 태운다.

        4단계는 프롬프트가 코드에 고정돼 있지만, 이건 호출 쪽이 프롬프트와
        스키마를 들고 온다. 사다리 순서(antigravity → codex → claude)는 같으므로
        1순위는 Antigravity 의 Gemini 3.7 Flash 다.
        """
        errors: list[str] = []
        for channel in self.order:
            provider = self._make(channel)
            try:
                # codex 만 schema_name 을 더 받는다. 채널마다 시그니처가 다른
                # 것을 여기서 흡수해 호출 쪽이 채널을 몰라도 되게 한다.
                if channel == "codex":
                    result = await provider._complete(
                        system_prompt, payload, schema=schema, schema_name="autofill"
                    )
                else:
                    result = await provider._complete(
                        system_prompt, payload, schema=schema
                    )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{channel}: {exc}")
                record_mae_channel(channel, False, str(exc))
                continue
            record_mae_channel(channel, True)
            return result
        raise RuntimeError("마에 CLI 사다리가 모두 실패했다. " + " | ".join(errors))

    async def render(self, layout: dict[str, Any], tokens: dict[str, Any]) -> dict[str, Any]:
        # 사다리를 그대로 탄다. 여기만 no-op 으로 두면 로컬 기본 provider 에서
        # Stage 4 가 통째로 빠져 시안이 컨셉 보드로 되돌아간다.
        return await self._across("render", layout, tokens)
