"""생성 파이프라인을 위한 AI provider 인터페이스.

파이프라인(app/services/ai/pipeline.py)은 이 네 개의 단계 메서드를 순서대로
호출한다. 각 provider(Gemini, Codex)가 이를 구현한다. PROMPTS와 요청
구성은 의도적으로 비워 두었으므로 provider별로 채워 넣어야 한다.

계약(모든 단계는 평범한 JSON 직렬화 가능 dict를 받고/반환한다):

  analyze_input(requirements, platform) -> analysis
      Stage 1 · InputAnalyzer — 사용자의 요구사항(목표, 톤, 컬러 방향,
      레이아웃 힌트)을 구조화한다. 비전 입력은 선택 사항이다.

  generate_concepts(analysis, n) -> [concept, ...]   (len == n)
      Stage 2 · ConceptEngine — 서로 구별되는 N개의 디자인 컨셉을 생성하며,
      각각은 W3C DTCG 스타일의 토큰 세트다: {conceptLabel, conceptName, description, tokens}.

  generate_layouts(concept, variants) -> [layout, ...]   (len == variants)
      Stage 3 · LayoutEngine — 컨셉별로 `variants` 개의 컨셉 시안을 생성한다:
      {kind, title, nodeTree}. 사이트 목업 페이지가 아니다.

  render(layout, tokens) -> {imageUrl?, nodeTree?}
      Stage 4 · Renderer — 레이아웃 + 토큰을 렌더링된 산출물로 변환한다.
"""
from __future__ import annotations

import abc
from typing import Any


class AIProvider(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    async def analyze_input(
        self, requirements: str, platform: str
    ) -> dict[str, Any]: ...

    @abc.abstractmethod
    async def generate_concepts(
        self, analysis: dict[str, Any], n: int
    ) -> list[dict[str, Any]]: ...

    @abc.abstractmethod
    async def generate_layouts(
        self, concept: dict[str, Any], variants: int
    ) -> list[dict[str, Any]]: ...

    @abc.abstractmethod
    async def render(
        self, layout: dict[str, Any], tokens: dict[str, Any]
    ) -> dict[str, Any]: ...
