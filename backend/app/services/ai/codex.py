"""Codex CLI provider.

ChatGPT 구독의 `codex exec` 를 호출한다. OpenAI API 키는 쓰지 않는다.
스키마는 `schemas.py` 계약이며, CLI 가 자유 서술을 섞을 수 있어
`codex_cli.extract_json_object` 로 JSON 만 꺼낸 뒤 기존 검증을 태운다.

Stage 4(Renderer)는 모델이 직접 쓴 완성 페이지 마크업을 받는다. 앞 세 단계가
무엇을 그릴지 정하고, 실제 픽셀은 이 단계의 HTML 이 정한다. gemini.py 가 같은
프롬프트를 import 해 쓰므로 두 provider 는 같은 계약을 향하고 결과 품질만
비교하면 된다.
"""
from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.codex_cli import run_codex_json
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

PROMPT_INPUT_ANALYZER = (
    "당신은 브랜드·비주얼 컨셉 분석가다. 사용자 원문에서 실제 웹사이트 시안을 "
    "그리는 데 필요한 것을 뽑는다. 목표, 타깃 사용자, 톤 키워드, 컬러 방향, "
    "키비주얼 힌트, 핵심 무드를 도출하라. 동시에 recreatePrompt(피사체·구도·"
    "스타일·조명·색·무드 한 문단), stylePrompt(룩앤필만, 피사체 이름 금지), "
    "summary, visual(subject/composition/style/lighting/mood), tags(5~12)를 "
    "채워라. 이 서비스가 어떤 사이트이고 어떤 정보를 담아야 하는지 — 주 메뉴 "
    "후보, 대표 콘텐츠 종류, 사용자가 첫 화면에서 하려는 일 — 도 함께 추론하라. "
    "대표 장면이 불명확하면 main 을 고른다. 짧거나 모호해도 추론하고 빈 값을 "
    "반환하지 마라. 사용자가 적은 색·무드·대상·금지어를 빼먹지 마라. "
    "recreatePrompt 와 stylePrompt 는 줄바꿈·마크다운·번호 없이 한 문단이다."
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
    "산출물은 **실제로 오픈해도 되는 완성 웹페이지 시안**이다. 색·타이포만 "
    "보여 주는 컨셉 보드나 회색 상자를 늘어놓은 와이어프레임이 아니다. 그러므로 "
    "sections 배열에 이 페이지의 정보구조(IA)를 위에서 아래로 실제로 설계하라 — "
    "상단 안내 띠·글로벌 내비게이션·키비주얼 히어로·바로가기·핵심 서비스 카드·"
    "안내 단계·공지 목록·패밀리사이트 스트립·푸터처럼, 그 업종의 진짜 사이트가 "
    "가지는 구성을 보통 6~10개 섹션으로 담는다. 각 섹션의 heading 에는 더미가 "
    "아니라 그 서비스에 실제로 쓸 한국어 문구를 적어라(Lorem ipsum·'제목입니다'·"
    "'텍스트' 금지). 모든 항목의 kind 는 targetScreen 하나로 동일해야 한다. "
    "variantLabel 에 구조 차이를 한국어 한 구절로 명시하라. title 에는 컨셉 무드와 "
    "사용자 프롬프트가 드러나는 짧은 한국어 제목을 붙여라."
)

PROMPT_RENDERER = """당신은 실무 웹디자이너다. 주어진 컨셉 토큰과 섹션 개요(sections)로 **완성된 웹페이지 시안 한 벌**의 HTML 을 직접 그린다. 클라이언트에게 그대로 보여 줄 시안이므로, 다 그린 화면이어야 한다.

[산출 형식]
· <style> 하나 + 섹션들로 이루어진 조각을 낸다. <html>·<head>·<body>·<!DOCTYPE>·<script> 는 쓰지 않는다.
· 폭 1440px 고정으로 설계한다. 미디어 쿼리·반응형은 필요 없다.
· 세로 길이에 제한을 두지 마라. 실제 사이트 한 페이지 분량(대개 2500~6000px)을 다 그린다. 한 화면에 욱여넣지 마라.

[색·타이포]
· 색·간격·서체·라운드·그림자는 반드시 주어진 CSS 변수를 쓴다 — var(--ds-color-primary), var(--ds-color-secondary), var(--ds-color-bg), var(--ds-color-surface), var(--ds-color-text), var(--ds-color-text-muted), var(--ds-font-family), var(--ds-radius-md), var(--ds-space-6) 등. 토큰을 무시하고 색을 직접 박으면 사용자가 토큰을 바꿔도 시안이 따라오지 않는다. 그라디언트·투명도처럼 토큰에 없는 값만 color-mix() 나 직접 값으로 쓴다.
· 제목과 본문의 크기 차이를 크게 벌려 위계를 만든다. 히어로 제목은 48~72px 급이다.

[내용]
· 모든 문구는 그 서비스에 실제로 쓸 법한 한국어다. 'Lorem ipsum'·'제목입니다'·'텍스트'·'버튼' 같은 더미는 금지다. 메뉴명·공지 제목·날짜·카드 설명·전화번호·주소·카피라이트까지 그럴듯하게 채운다.
· 회색 상자 자리표시자를 두지 마라. 빈 칸으로 남기느니 내용을 지어 넣는다.

[이미지]
· 사진·일러스트가 들어갈 자리는 <img src="{{img:식별자}}" alt="..."> 로 두고, 같은 식별자를 imageSlots 배열에 하나씩 적는다. 식별자는 영문·숫자·하이픈·밑줄만 쓴다(예: hero-main, card-service-1).
· 슬롯은 4~10개가 적당하다. 히어로 키비주얼, 카드 배경 사진, 배너 인물 컷처럼 **실제 사진이 필요한 자리**에만 쓴다. 아이콘·도형·패턴은 슬롯이 아니라 인라인 <svg> 나 CSS 그라디언트로 직접 그린다.
· 각 슬롯의 prompt 는 피사체·구도·색감·질감을 적은 한 문단이다. 이미지 안에 글자를 넣으라고 요구하지 마라 — 글자는 HTML 이 그린다.
· <img> 에는 반드시 CSS 로 width/height 와 object-fit: cover 를 줘서 생성 이미지의 비율이 달라도 레이아웃이 흔들리지 않게 한다.

[구조 지시]
· sections 배열의 순서·역할·heading 을 그대로 따른다. 임의로 빼거나 순서를 바꾸지 마라.
· 각 섹션 최상위 요소에 data-section="<섹션 id>" 를 붙인다.
· creativeDirection 이 주어지면 그 레이아웃·밀도·컴포넌트 지시를 이 페이지의 구조에 반영한다. 같은 컨셉의 다른 시안과 색·무드는 같고 구조만 달라야 한다."""


class CodexProvider(AIProvider):
    name = "codex"

    async def _complete(
        self,
        prompt: str,
        payload: dict[str, Any],
        *,
        schema: dict[str, Any],
        schema_name: str,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        """구조화된 JSON을 반환하는 단일 Codex CLI 호출."""
        del schema_name  # CLI 는 스키마 파일로 전달한다.
        return await run_codex_json(
            system_prompt=prompt, payload=payload, schema=schema, timeout=timeout
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
        """Stage 4 · Renderer — 완성 페이지 시안 마크업을 받는다.

        시안의 픽셀을 정하는 것이 이 단계다. 앞 세 단계는 무엇을 그릴지만
        정하고, 실제로 그리는 것은 여기서 모델이 쓴 HTML 이다.
        """
        result = await self._complete(
            PROMPT_RENDERER,
            build_render_payload(layout, tokens),
            schema=RENDER_SCHEMA,
            schema_name="mockup_render",
            # Stage 4 만 길게 준다 — 앞 단계와 같은 상한이면 페이지를 다 쓰기
            # 전에 끊긴다.
            timeout=settings.codex_render_timeout_seconds,
        )
        return finalize_render(result)
