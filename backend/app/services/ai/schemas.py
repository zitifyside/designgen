"""AI 파이프라인 4단계가 공유하는 JSON 스키마 + 출력 검증.

OpenAI structured outputs(`response_format={"type": "json_schema", ...}`)와
Gemini `response_schema` 둘 다 표준 JSON Schema dict를 그대로 받아들이므로,
Codex/Gemini 프로바이더 양쪽에서 이 스키마를 그대로 재사용한다.

스키마는 프론트엔드가 실제로 소비하는 계약과 정확히 일치해야 한다 —
어긋나면 400/스키마 오류로 바로 드러나는 게 아니라 DB에는 저장되는데
화면에 색이 안 먹거나 조용히 깨지는 형태로 나타난다:
  - `DesignTokens` 형태 → frontend/src/lib/types.ts
  - 토큰 → CSS 변수 매핑(허용 enum) → frontend/src/lib/token-utils.ts
  - mockup.kind 스위치 → frontend/src/components/workspace/MockupRenderer.tsx
"""
from __future__ import annotations

from typing import Any

from app.services.ai.placeholder import MOCKUP_KINDS

ALLOWED_KINDS: list[str] = [k["kind"] for k in MOCKUP_KINDS]

ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "goal": {
            "type": "string",
            "description": "이 프로젝트가 달성하려는 핵심 목표를 한두 문장으로.",
        },
        "targetAudience": {"type": "string"},
        "tone": {
            "type": "array",
            "items": {"type": "string"},
            "description": "톤앤매너를 나타내는 키워드 3~5개.",
        },
        "colorDirection": {
            "type": "string",
            "description": "컬러 방향에 대한 서술. 예: '차분한 뉴트럴 톤', '비비드하고 대담한 컬러'.",
        },
        "layoutHints": {
            "type": "array",
            "items": {"type": "string"},
            "description": "레이아웃 구성에 대한 힌트(정보 밀도, 우선 노출 섹션 등).",
        },
        "keyFeatures": {
            "type": "array",
            "items": {"type": "string"},
            "description": "화면에서 강조해야 할 핵심 기능/섹션.",
        },
    },
    "required": [
        "goal", "targetAudience", "tone", "colorDirection", "layoutHints", "keyFeatures",
    ],
    "additionalProperties": False,
}

_COLOR_KEYS = [
    "primary", "secondary", "neutral", "background", "surface", "text",
    "textMuted", "success", "warning", "error", "info",
]

_COLOR_TOKEN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        k: {
            "type": "string",
            "description": "#RRGGBB 형식의 유효한 hex 컬러.",
        }
        for k in _COLOR_KEYS
    },
    "required": _COLOR_KEYS,
    "additionalProperties": False,
}

_TYPOGRAPHY_TOKEN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "fontFamily": {"type": "string"},
        "baseSize": {"type": "number", "description": "px 단위 기준 폰트 크기(보통 13~18)."},
        "scale": {"type": "number", "description": "타이포 스케일 비율(보통 1.15~1.4)."},
        "weights": {
            "type": "object",
            "properties": {
                "regular": {"type": "number"},
                "medium": {"type": "number"},
                "bold": {"type": "number"},
            },
            "required": ["regular", "medium", "bold"],
            "additionalProperties": False,
        },
        "lineHeight": {"type": "number"},
        "letterSpacing": {"type": "number", "description": "em 단위. 보통 -0.02~0.01."},
    },
    "required": ["fontFamily", "baseSize", "scale", "weights", "lineHeight", "letterSpacing"],
    "additionalProperties": False,
}

_SPACING_TOKEN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"baseUnit": {"type": "number", "description": "px 단위 기본 간격 단위(보통 4~16)."}},
    "required": ["baseUnit"],
    "additionalProperties": False,
}

_BORDER_TOKEN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "width": {"type": "number"},
        "radiusSm": {"type": "number"},
        "radiusMd": {"type": "number"},
        "radiusLg": {"type": "number"},
        "style": {"type": "string", "enum": ["solid", "dashed", "dotted"]},
    },
    "required": ["width", "radiusSm", "radiusMd", "radiusLg", "style"],
    "additionalProperties": False,
}

_SHADOW_TOKEN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"preset": {"type": "string", "enum": ["none", "sm", "md", "lg", "xl"]}},
    "required": ["preset"],
    "additionalProperties": False,
}

_COMPONENT_TOKEN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "buttonVariant": {"type": "string", "enum": ["rounded", "pill", "square"]},
        "inputStyle": {"type": "string", "enum": ["outlined", "filled", "underline"]},
        "cardElevation": {"type": "string", "enum": ["flat", "raised", "outlined"]},
    },
    "required": ["buttonVariant", "inputStyle", "cardElevation"],
    "additionalProperties": False,
}

DESIGN_TOKENS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "color": _COLOR_TOKEN_SCHEMA,
        "typography": _TYPOGRAPHY_TOKEN_SCHEMA,
        "spacing": _SPACING_TOKEN_SCHEMA,
        "border": _BORDER_TOKEN_SCHEMA,
        "shadow": _SHADOW_TOKEN_SCHEMA,
        "components": _COMPONENT_TOKEN_SCHEMA,
    },
    "required": ["color", "typography", "spacing", "border", "shadow", "components"],
    "additionalProperties": False,
}

CONCEPTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "concepts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "conceptLabel": {"type": "string", "enum": ["A", "B", "C"]},
                    "conceptName": {"type": "string", "description": "짧은 컨셉 이름(영문, 2~3단어)."},
                    "description": {"type": "string", "description": "컨셉을 설명하는 한국어 한 문장."},
                    "tokens": DESIGN_TOKENS_SCHEMA,
                },
                "required": ["conceptLabel", "conceptName", "description", "tokens"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["concepts"],
    "additionalProperties": False,
}

LAYOUTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "layouts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ALLOWED_KINDS},
                    "title": {"type": "string", "description": "화면을 나타내는 짧은 한국어 제목."},
                },
                "required": ["kind", "title"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["layouts"],
    "additionalProperties": False,
}


def validate_concepts(concepts: list[dict[str, Any]], n: int) -> None:
    """개수·라벨 순서를 검증한다. 스키마가 형태는 보장해도 개수는 보장 못 한다."""
    if len(concepts) != n:
        raise ValueError(f"expected {n} concepts, got {len(concepts)}")
    expected_labels = ["A", "B", "C"][:n]
    got_labels = [c["conceptLabel"] for c in concepts]
    if got_labels != expected_labels:
        raise ValueError(f"expected conceptLabel order {expected_labels}, got {got_labels}")


def validate_layouts(layouts: list[dict[str, Any]], variants: int) -> None:
    """개수·kind 중복을 검증한다. variants가 사용 가능한 kind 수를 넘으면 그만큼만 허용."""
    expected = min(variants, len(ALLOWED_KINDS))
    if len(layouts) != expected:
        raise ValueError(f"expected {expected} layouts, got {len(layouts)}")
    kinds = [layout["kind"] for layout in layouts]
    if len(set(kinds)) != len(kinds):
        raise ValueError(f"duplicate kind in layouts: {kinds}")
