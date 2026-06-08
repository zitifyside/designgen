"""Gemini (Google) provider.

SDK 클라이언트는 연결되어 있지만, 모든 프롬프트 + 요청 본문은 의도적으로
비워 두었다 — 용도에 맞게 `PROMPT_*`와 `_complete()` 호출 형태를 채워 넣어라.

Docs: https://ai.google.dev/gemini-api/docs  (SDK: `google-genai`)
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


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self) -> None:
        self._client = None  # 키 없이도 앱이 부팅되도록 지연 생성

    def _get_client(self):
        if self._client is None:
            if not settings.gemini_api_key:
                raise RuntimeError(
                    "GEMINI_API_KEY is not set — cannot call the Gemini API."
                )
            from google import genai  # 지연 임포트

            self._client = genai.Client(api_key=settings.gemini_api_key)
        return self._client

    async def _complete(self, prompt: str, payload: dict[str, Any]) -> dict[str, Any]:
        """파싱된 JSON을 반환하는 단일 Gemini 호출.

        TODO: prompt + payload로 `contents`를 구성하고, JSON 출력을 요청한 뒤
        응답을 파싱한다. 의도적으로 비워 두었다.
        """
        raise NotImplementedError("Gemini call not implemented yet — see app/services/ai/gemini.py")

    # ── 파이프라인 단계 ────────────────────────────────────────────
    async def analyze_input(self, requirements: str, platform: str) -> dict[str, Any]:
        # TODO: return await self._complete(PROMPT_INPUT_ANALYZER, {...})
        raise NotImplementedError

    async def generate_concepts(self, analysis: dict[str, Any], n: int) -> list[dict[str, Any]]:
        # TODO: return await self._complete(PROMPT_CONCEPT_ENGINE, {...})
        raise NotImplementedError

    async def generate_layouts(self, concept: dict[str, Any], variants: int) -> list[dict[str, Any]]:
        # TODO: return await self._complete(PROMPT_LAYOUT_ENGINE, {...})
        raise NotImplementedError

    async def render(self, layout: dict[str, Any], tokens: dict[str, Any]) -> dict[str, Any]:
        # TODO: return await self._complete(PROMPT_RENDERER, {...})
        raise NotImplementedError
