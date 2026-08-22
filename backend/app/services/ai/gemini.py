"""Gemini (Google) provider.

Docs: https://ai.google.dev/gemini-api/docs  (SDK: `google-genai`)

4단계 전부 `response_mime_type="application/json"` + `response_schema`로
구조화된 출력을 강제한다 — `schemas.py`의 스키마가 곧 프론트엔드 계약이므로
자유서술 출력을 파싱하는 방식은 쓰지 않는다.

Stage 4(Renderer)는 모델이 직접 쓴 완성 페이지 마크업을 받는다 — 시안의
픽셀을 정하는 단계이며, 프롬프트·검증·살균은 codex.py·render_stage.py 와
공유한다.
"""
from __future__ import annotations

import json
from typing import Any

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.codex import (
    PROMPT_CONCEPT_ENGINE,
    PROMPT_INPUT_ANALYZER,
    PROMPT_LAYOUT_ENGINE,
    PROMPT_RENDERER,
)
from app.services.ai.placeholder import archetype_for
from app.services.ai.render_stage import build_render_payload, finalize_render
from app.services.ai.schemas import (
    ANALYSIS_SCHEMA,
    CONCEPTS_SCHEMA,
    LAYOUTS_SCHEMA,
    RENDER_SCHEMA,
    validate_concepts,
    validate_layouts,
)

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

    async def _complete(
        self,
        prompt: str,
        payload: dict[str, Any],
        *,
        schema: dict[str, Any],
        model: str | None = None,
        max_output_tokens: int | None = None,
    ) -> dict[str, Any]:
        """구조화된 JSON을 반환하는 단일 Gemini 호출."""
        from google.genai import types  # 지연 임포트

        client = self._get_client()
        contents = f"{prompt}\n\n입력 데이터(JSON):\n{json.dumps(payload, ensure_ascii=False)}"
        response = await client.aio.models.generate_content(
            model=model or settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                max_output_tokens=max_output_tokens,
            ),
        )
        # 출력 상한에 걸려 끊긴 응답은 "빈 응답"이나 "JSON 파싱 실패"로 나타나
        # 원인이 안 보인다. 끊겼다는 사실을 그대로 올려 진단 가능하게 한다.
        for candidate in response.candidates or []:
            if str(getattr(candidate, "finish_reason", "")).endswith("MAX_TOKENS"):
                raise RuntimeError(
                    "Gemini hit the output token limit — raise "
                    "GEMINI_RENDER_MAX_OUTPUT_TOKENS or use a model with a "
                    "larger output window"
                )
        text = response.text
        if not text:
            raise RuntimeError("Gemini returned an empty response")
        return json.loads(text)

    # ── 파이프라인 단계 ────────────────────────────────────────────
    async def analyze_input(self, requirements: str, platform: str) -> dict[str, Any]:
        return await self._complete(
            PROMPT_INPUT_ANALYZER,
            {"requirements": requirements, "platform": platform},
            schema=ANALYSIS_SCHEMA,
        )

    async def generate_concepts(self, analysis: dict[str, Any], n: int) -> list[dict[str, Any]]:
        result = await self._complete(
            PROMPT_CONCEPT_ENGINE,
            {"analysis": analysis, "conceptCount": n},
            schema=CONCEPTS_SCHEMA,
        )
        concepts = result["concepts"]
        validate_concepts(concepts, n)
        return concepts

    async def generate_layouts(self, concept: dict[str, Any], variants: int) -> list[dict[str, Any]]:
        result = await self._complete(
            PROMPT_LAYOUT_ENGINE,
            {
                "concept": concept,
                "variantCount": variants,
                "targetScreen": concept.get("targetScreen", "main"),
                "targetScreenTitle": concept.get("targetScreenTitle", ""),
                "userPrompt": concept.get("userPrompt", ""),
                "projectName": concept.get("projectName", ""),
                "visualBrief": concept.get("visualBrief") or {},
                "creativeDirections": concept.get("creativeDirections") or [],
            },
            schema=LAYOUTS_SCHEMA,
        )
        layouts = result["layouts"]
        validate_layouts(layouts, variants, archetype_for(
            concept.get("targetScreen", "main"),
            concept.get("targetScreenTitle", ""),
        ))
        return [{**layout, "nodeTree": None} for layout in layouts]

    async def render(self, layout: dict[str, Any], tokens: dict[str, Any]) -> dict[str, Any]:
        """Stage 4 · Renderer — 완성 페이지 시안 마크업을 받는다.

        시안의 픽셀을 정하는 것이 이 단계다. 앞 세 단계는 무엇을 그릴지만
        정하고, 실제로 그리는 것은 여기서 모델이 쓴 HTML 이다.
        """
        result = await self._complete(
            PROMPT_RENDERER,
            build_render_payload(layout, tokens),
            schema=RENDER_SCHEMA,
            model=settings.gemini_render_model or settings.gemini_model,
            max_output_tokens=settings.gemini_render_max_output_tokens,
        )
        return finalize_render(result)
