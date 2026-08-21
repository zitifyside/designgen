"""Codex CLI provider.

ChatGPT 구독의 `codex exec` 를 호출한다. OpenAI API 키는 쓰지 않는다.
스키마는 `schemas.py` 계약이며, CLI 가 자유 서술을 섞을 수 있어
`codex_cli.extract_json_object` 로 JSON 만 꺼낸 뒤 기존 검증을 태운다.

Stage 4(Renderer)는 의도적으로 API를 호출하지 않는다 — `nodeTree`를 실제로
소비하는 프론트엔드 코드가 없고(placeholder.py도 항상 None을 반환), 스키마도
정의된 적이 없다. 소비처가 생기기 전까지 LLM 호출 자체가 낭비이므로 no-op으로
둔다. 아래 render() 독스트링 참고. (gemini.py와 동일한 프롬프트 문구를 쓴다 —
두 provider가 같은 계약을 향하므로 결과 품질만 비교하면 되게.)
"""
from __future__ import annotations

from typing import Any

from app.services.ai.base import AIProvider
from app.services.ai.codex_cli import run_codex_json
from app.services.ai.placeholder import archetype_for
from app.services.ai.schemas import (
    ANALYSIS_SCHEMA,
    CONCEPTS_SCHEMA,
    LAYOUTS_SCHEMA,
    validate_concepts,
    validate_layouts,
)

PROMPT_INPUT_ANALYZER = (
    "당신은 브랜드·비주얼 컨셉 분석가다. 코덱스 이미지 생성기의 프롬프트 추출과 "
    "같이, 사용자 원문을 이미지 생성기에 넣을 수 있는 구조로 뽑는다. 목표, 타깃 "
    "사용자, 톤 키워드, 컬러 방향, 키비주얼 힌트, 핵심 무드를 도출하라. 동시에 "
    "recreatePrompt(피사체·구도·스타일·조명·색·무드 한 문단), stylePrompt(룩앤필만, "
    "피사체 이름 금지), summary, visual(subject/composition/style/lighting/mood), "
    "tags(5~12)를 채워라. 사이트 IA나 목업 페이지 구조를 추론하지 마라. 대표 장면이 "
    "불명확하면 main 을 고른다. 짧거나 모호해도 추론하고 빈 값을 반환하지 마라. "
    "사용자가 적은 색·무드·대상·금지어를 빼먹지 마라. recreatePrompt 와 "
    "stylePrompt 는 줄바꿈·마크다운·번호 없이 한 문단이다."
)

PROMPT_CONCEPT_ENGINE = (
    "당신은 디자인 시스템 설계자다. 주어진 분석과 visualBrief(recreatePrompt, "
    "stylePrompt, visual, tags), 사용자 원문(userPrompt, projectName)을 바탕으로 "
    "서로 뚜렷하게 구별되는 디자인 컨셉을 요청된 개수만큼 생성하라. conceptLabel은 "
    "반드시 순서대로 A, B, C를 사용한다. conceptName 은 그 프롬프트에서 나온 고유 "
    "이름이어야 한다. Modern Minimal, Bold Vibrant, Soft Pastel 같은 placeholder "
    "이름은 절대 쓰지 마라. 각 컨셉의 imagePrompt 는 그 컨셉을 이미지 생성기에 "
    "넣을 한 문단이고, stylePrompt 는 룩앤필만이다. 토큰 색은 recreatePrompt·"
    "stylePrompt 의 팔레트를 따른다. 각 컨셉은 서로 다른 무드를 색상·타이포·형태 "
    "전반에서 명확히 표현해야 하며, 단순히 primary 색상만 바꾸지 마라. 사용자가 "
    "지정한 컬러·톤·대상을 최소 한 컨셉에는 직접 반영하라. text와 background "
    "색상 조합은 WCAG AA 대비 기준(4.5:1 이상)을 충족해야 한다. 모든 색상 값은 "
    "#RRGGBB 형식의 유효한 hex 문자열이어야 한다."
)

PROMPT_LAYOUT_ENGINE = (
    "당신은 컨셉 시안 디자이너다. 주어진 디자인 컨셉과 대상 장면(targetScreen), "
    "사용자 원문, visualBrief, 그리고 creativeDirections 배열에 대해 요청된 "
    "개수만큼의 **컨셉 시안 변형**을 설계하라. i 번째 레이아웃은 "
    "creativeDirections[i] 의 레이아웃·밀도·내비게이션·컴포넌트·강조를 반드시 "
    "따른다. 이 축들은 화면 구조를 가르는 축이며 컨셉의 무드·색·타이포는 바꾸지 "
    "않는다 — 한 컨셉의 시안들은 같은 정체성을 유지한 채 구조만 달라야 한다. "
    "다만 사용자가 원문이나 컨셉 정의에서 구조를 명시했다면 그 제약이 "
    "creativeDirections 보다 우선한다. "
    "각 레이아웃의 imagePrompt 는 그 연출을 반영한 이미지 생성용 한 문단이다. "
    "산출물은 완성 웹사이트·앱의 목업 페이지가 아니다. 색·타이포·키비주얼·무드가 "
    "한눈에 드러나는 컨셉 보드다. 사이트 IA 를 만들지 마라. 모든 항목의 kind 는 "
    "targetScreen 하나로 동일해야 한다. variantLabel 에 연출 차이를 한국어 한 "
    "구절로 명시하라. title 에는 컨셉 무드와 사용자 프롬프트가 드러나는 짧은 "
    "한국어 제목을 붙여라."
)

# Stage 4(Renderer)는 아래 render() 독스트링 참고 — 현재 소비처가 없어 미호출.
PROMPT_RENDERER = (
    "(미사용) nodeTree를 실제로 렌더링하는 프론트엔드 소비처와 스키마가 "
    "정의되면, 그때 이 프롬프트를 채우고 render()에서 _complete()를 호출한다."
)


class CodexProvider(AIProvider):
    name = "codex"

    async def _complete(
        self,
        prompt: str,
        payload: dict[str, Any],
        *,
        schema: dict[str, Any],
        schema_name: str,
    ) -> dict[str, Any]:
        """구조화된 JSON을 반환하는 단일 Codex CLI 호출."""
        del schema_name  # CLI 는 스키마 파일로 전달한다.
        return await run_codex_json(
            system_prompt=prompt, payload=payload, schema=schema
        )

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
                "targetScreen": concept.get("targetScreen", "main"),
                "targetScreenTitle": concept.get("targetScreenTitle", ""),
                "userPrompt": concept.get("userPrompt", ""),
                "projectName": concept.get("projectName", ""),
                "visualBrief": concept.get("visualBrief") or {},
                "creativeDirections": concept.get("creativeDirections") or [],
            },
            schema=LAYOUTS_SCHEMA,
            schema_name="mockup_layouts",
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
