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

  render(layout, tokens) -> {html, imageSlots, pageHeight}
      Stage 4 · Renderer — 레이아웃 + 토큰으로 완성 페이지 마크업을 만든다.

  render_batch(layouts, tokens) -> [artifact|None, ...]
      Stage 4 를 여러 장. 채널을 여럿 가진 provider 는 장마다 다른 채널에
      맡겨 동시에 그린다.
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

    async def render_batch(
        self, layouts: list[dict[str, Any]], tokens: dict[str, Any]
    ) -> list[dict[str, Any] | None]:
        """여러 장을 한 번에. 기본은 순차이며 실패한 자리는 None 이다.

        채널을 여럿 가진 provider(마에 3채널)는 이걸 덮어써서 장마다 다른
        채널에 맡기고 동시에 그린다. 그 provider 밖에서는 나눌 채널이 없으므로
        순차가 맞다.
        """
        results: list[dict[str, Any] | None] = []
        for layout in layouts:
            try:
                results.append(await self.render(layout, tokens))
            except Exception:  # noqa: BLE001 — 한 장의 실패가 나머지를 막지 않는다.
                results.append(None)
        return results
