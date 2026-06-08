"""Codex / OpenAI provider.

SDK 클라이언트는 연결되어 있지만, 모든 프롬프트 + 요청 본문은 의도적으로
비워 두었다 — 용도에 맞게 `PROMPT_*`와 `_complete()` 호출 형태를 채워 넣어라.

Docs: https://platform.openai.com/docs  (SDK: `openai`)
"""
from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.ai.base import AIProvider

# ── 프롬프트 (TODO: 작성 필요) ────────────────────────────────────
PROMPT_INPUT_ANALYZER = ""      # 1단계
PROMPT_CONCEPT_ENGINE = ""      # 2단계
PROMPT_LAYOUT_ENGINE = ""       # 3단계
PROMPT_RENDERER = ""            # 4단계


class CodexProvider(AIProvider):
    name = "codex"

    def __init__(self) -> None:
        self._client = None  # 키 없이도 앱이 부팅되도록 지연 생성

    def _get_client(self):
        if self._client is None:
            if not settings.openai_api_key:
                raise RuntimeError(
                    "OPENAI_API_KEY is not set — cannot call the OpenAI/Codex API."
                )
            from openai import AsyncOpenAI  # 지연 임포트

            self._client = AsyncOpenAI(api_key=settings.openai_api_key)
        return self._client

    async def _complete(self, prompt: str, payload: dict[str, Any]) -> dict[str, Any]:
        """파싱된 JSON을 반환하는 단일 OpenAI 호출.

        TODO: prompt + payload로 `messages`를 구성하고, JSON 출력
        (response_format / structured outputs)을 요청한 뒤 파싱한다. 의도적으로 비워 두었다.
        """
        raise NotImplementedError("OpenAI call not implemented yet — see app/services/ai/codex.py")

    # ── 파이프라인 단계 ────────────────────────────────────────────
    async def analyze_input(self, requirements: str, platform: str) -> dict[str, Any]:
        raise NotImplementedError

    async def generate_concepts(self, analysis: dict[str, Any], n: int) -> list[dict[str, Any]]:
        raise NotImplementedError

    async def generate_layouts(self, concept: dict[str, Any], variants: int) -> list[dict[str, Any]]:
        raise NotImplementedError

    async def render(self, layout: dict[str, Any], tokens: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError
