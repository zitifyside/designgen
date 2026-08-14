"""Codex / OpenAI provider.

Docs: https://platform.openai.com/docs  (SDK: `openai`)

4단계 전부 Chat Completions의 structured outputs
(`response_format={"type": "json_schema", "strict": true, ...}`)로 구조화된
출력을 강제한다 — `schemas.py`의 스키마가 곧 프론트엔드 계약이므로 자유서술
출력을 파싱하는 방식은 쓰지 않는다.

Stage 4(Renderer)는 의도적으로 API를 호출하지 않는다 — `nodeTree`를 실제로
소비하는 프론트엔드 코드가 없고(placeholder.py도 항상 None을 반환), 스키마도
정의된 적이 없다. 소비처가 생기기 전까지 LLM 호출 자체가 낭비이므로 no-op으로
둔다. 아래 render() 독스트링 참고. (gemini.py와 동일한 프롬프트 문구를 쓴다 —
두 provider가 같은 계약을 향하므로 결과 품질만 비교하면 되게.)
"""
from __future__ import annotations

import json
from typing import Any

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.placeholder import archetype_for
from app.services.ai.schemas import (
    ANALYSIS_SCHEMA,
    CONCEPTS_SCHEMA,
    LAYOUTS_SCHEMA,
    validate_concepts,
    validate_layouts,
)

PROMPT_INPUT_ANALYZER = (
    "당신은 UI/UX 요구사항 분석가다. 사용자가 자유롭게 서술한 요구사항과 대상 "
    "플랫폼을 읽고, 이후 디자인 컨셉 생성 단계가 바로 활용할 수 있도록 구조화된 "
    "분석 결과를 만든다. 목표, 타깃 사용자, 톤앤매너 키워드, 컬러 방향에 대한 "
    "서술, 레이아웃 힌트, 강조할 핵심 기능을 도출하라. 요구사항이 짧거나 "
    "모호하더라도 플랫폼 관례를 참고해 합리적으로 추론하고, 절대 빈 값을 "
    "반환하지 마라."
)

PROMPT_CONCEPT_ENGINE = (
    "당신은 디자인 시스템 설계자다. 주어진 분석 결과를 바탕으로 서로 뚜렷하게 "
    "구별되는 디자인 컨셉을 요청된 개수만큼 생성하라. conceptLabel은 반드시 "
    "순서대로 A, B, C를 사용한다. 각 컨셉은 서로 다른 무드(예: 미니멀/비비드/"
    "파스텔, 라이트/다크 등)를 색상·타이포·형태 전반에서 명확히 표현해야 하며, "
    "단순히 primary 색상만 바꾸는 식으로 대충 구별하지 마라. text와 background "
    "색상 조합은 WCAG AA 대비 기준(4.5:1 이상)을 충족해야 한다. 모든 색상 값은 "
    "#RRGGBB 형식의 유효한 hex 문자열이어야 한다."
)

PROMPT_LAYOUT_ENGINE = (
    "당신은 정보 구조 설계자다. 주어진 디자인 컨셉과 대상 화면(targetScreen) 하나에 "
    "대해, 요청된 개수만큼의 **레이아웃 구조 변형**을 설계하라. 변형은 서로 다른 "
    "화면이 아니라 같은 화면을 다르게 구성한 안이므로 모든 항목의 kind는 "
    "targetScreen 하나로 동일해야 한다. 각 변형은 섹션 배치·정렬·분할 구조가 "
    "실제로 달라야 하며(구조적 유사도 70% 이하), variantLabel에 그 구조 차이를 "
    "한국어 한 구절로 명시하라. title에는 컨셉의 무드와 어울리는 짧은 한국어 "
    "제목을 붙여라."
)

# Stage 4(Renderer)는 아래 render() 독스트링 참고 — 현재 소비처가 없어 미호출.
PROMPT_RENDERER = (
    "(미사용) nodeTree를 실제로 렌더링하는 프론트엔드 소비처와 스키마가 "
    "정의되면, 그때 이 프롬프트를 채우고 render()에서 _complete()를 호출한다."
)


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

    async def _complete(
        self,
        prompt: str,
        payload: dict[str, Any],
        *,
        schema: dict[str, Any],
        schema_name: str,
    ) -> dict[str, Any]:
        """구조화된 JSON을 반환하는 단일 OpenAI 호출."""
        client = self._get_client()
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": f"입력 데이터(JSON):\n{json.dumps(payload, ensure_ascii=False)}",
                },
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": schema_name,
                    "schema": schema,
                    "strict": True,
                },
            },
        )
        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("OpenAI returned an empty response")
        return json.loads(content)

    # ── 파이프라인 단계 ────────────────────────────────────────────
    async def analyze_input(self, requirements: str, platform: str) -> dict[str, Any]:
        return await self._complete(
            PROMPT_INPUT_ANALYZER,
            {"requirements": requirements, "platform": platform},
            schema=ANALYSIS_SCHEMA,
            schema_name="input_analysis",
        )

    async def generate_concepts(self, analysis: dict[str, Any], n: int) -> list[dict[str, Any]]:
        result = await self._complete(
            PROMPT_CONCEPT_ENGINE,
            {"analysis": analysis, "conceptCount": n},
            schema=CONCEPTS_SCHEMA,
            schema_name="design_concepts",
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
                "targetScreen": concept.get("targetScreen", "landing"),
                "targetScreenTitle": concept.get("targetScreenTitle", ""),
            },
            schema=LAYOUTS_SCHEMA,
            schema_name="mockup_layouts",
        )
        layouts = result["layouts"]
        validate_layouts(layouts, variants, archetype_for(
            concept.get("targetScreen", "landing"),
            concept.get("targetScreenTitle", ""),
        ))
        return [{**layout, "nodeTree": None} for layout in layouts]

    async def render(self, layout: dict[str, Any], tokens: dict[str, Any]) -> dict[str, Any]:
        """의도적 no-op.

        `nodeTree`를 실제로 그리는 프론트엔드 코드가 없다(MockupRenderer.tsx는
        `mockup.kind`+`mockup.index`만으로 5종의 하드코딩된 목업을 렌더하고
        `node_tree` 컬럼은 읽지 않는다) — 스키마도 정의된 적이 없다. 존재하지
        않는 계약을 향해 LLM을 호출하는 건 비용·지연만 늘리는 낭비이므로,
        소비처와 스키마가 생기기 전까지는 호출하지 않는다.
        """
        return {}
