"""마에 경로의 Antigravity 구독 CLI (agy via gemini-call.ps1)."""
from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.codex import (
    PROMPT_CONCEPT_ENGINE,
    PROMPT_INPUT_ANALYZER,
    PROMPT_LAYOUT_ENGINE,
    PROMPT_RENDERER,
)
from app.services.ai.mae_cli import run_antigravity_json
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


class AntigravityProvider(AIProvider):
    name = "antigravity"

    async def _complete(
        self,
        prompt: str,
        payload: dict[str, Any],
        *,
        schema: dict[str, Any],
        timeout: int | None = None,
    ) -> dict[str, Any]:
        return await run_antigravity_json(
            system_prompt=prompt, payload=payload, schema=schema, timeout=timeout
        )

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
        validate_layouts(
            layouts,
            variants,
            archetype_for(
                concept.get("targetScreen", "main"),
                concept.get("targetScreenTitle", ""),
            ),
        )
        return [{**layout, "nodeTree": None} for layout in layouts]

    async def render(self, layout: dict[str, Any], tokens: dict[str, Any]) -> dict[str, Any]:
        result = await self._complete(
            PROMPT_RENDERER,
            build_render_payload(layout, tokens),
            schema=RENDER_SCHEMA,
            # Stage 4 만 길게 준다. 앞 단계와 같은 상한을 쓰면 페이지를 다 쓰기
            # 전에 끊겨 사다리 세 채널을 모두 태우고도 빈손이 된다.
            timeout=settings.mae_cli_render_timeout_seconds,
        )
        return finalize_render(result)
