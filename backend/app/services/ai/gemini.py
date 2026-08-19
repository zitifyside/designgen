"""Gemini (Google) provider.

Docs: https://ai.google.dev/gemini-api/docs  (SDK: `google-genai`)

4단계 전부 `response_mime_type="application/json"` + `response_schema`로
구조화된 출력을 강제한다 — `schemas.py`의 스키마가 곧 프론트엔드 계약이므로
자유서술 출력을 파싱하는 방식은 쓰지 않는다.

Stage 4(Renderer)는 의도적으로 API를 호출하지 않는다 — `nodeTree`를 실제로
소비하는 프론트엔드 코드가 없고(placeholder.py도 항상 None을 반환), 스키마도
정의된 적이 없다. 소비처가 생기기 전까지 LLM 호출 자체가 낭비이므로 no-op으로
둔다. 아래 render() 독스트링 참고.
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
)
from app.services.ai.placeholder import archetype_for
from app.services.ai.schemas import (
    ANALYSIS_SCHEMA,
    CONCEPTS_SCHEMA,
    LAYOUTS_SCHEMA,
    validate_concepts,
    validate_layouts,
)

# Stage 4(Renderer)는 아래 render() 독스트링 참고 — 현재 소비처가 없어 미호출.
PROMPT_RENDERER = (
    "(미사용) nodeTree를 실제로 렌더링하는 프론트엔드 소비처와 스키마가 "
    "정의되면, 그때 이 프롬프트를 채우고 render()에서 _complete()를 호출한다."
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
    ) -> dict[str, Any]:
        """구조화된 JSON을 반환하는 단일 Gemini 호출."""
        from google.genai import types  # 지연 임포트

        client = self._get_client()
        contents = f"{prompt}\n\n입력 데이터(JSON):\n{json.dumps(payload, ensure_ascii=False)}"
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
            ),
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
        """의도적 no-op.

        `nodeTree`를 실제로 그리는 프론트엔드 코드가 없다(MockupRenderer.tsx는
        `mockup.kind`+`mockup.index`만으로 6종의 하드코딩된 시안을 렌더하고
        `node_tree` 컬럼은 읽지 않는다) — 스키마도 정의된 적이 없다. 존재하지
        않는 계약을 향해 LLM을 호출하는 건 비용·지연만 늘리는 낭비이므로,
        소비처와 스키마가 생기기 전까지는 호출하지 않는다.
        """
        return {}
