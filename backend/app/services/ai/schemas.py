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

import re
from typing import Any

from app.services.ai.placeholder import SCREEN_PRESETS

# 렌더 아키타입 = 요건 입력의 '대표 장면' 프리셋과 동일한 6종.
ALLOWED_KINDS: list[str] = list(SCREEN_PRESETS)

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
        "recreatePrompt": {
            "type": "string",
            "description": (
                "이미지 생성기에 넣을 한 문단 프롬프트. 피사체·구도·스타일·조명·색·무드. "
                "줄바꿈·마크다운·번호 금지."
            ),
        },
        "stylePrompt": {
            "type": "string",
            "description": (
                "룩앤필만 담은 한 문단. 팔레트·조명·무드·매체. 구체 피사체 이름 금지."
            ),
        },
        "summary": {"type": "string", "description": "이 시안이 무엇인지 한 문장."},
        "visual": {
            "type": "object",
            "properties": {
                "subject": {"type": "string"},
                "composition": {"type": "string"},
                "style": {"type": "string"},
                "lighting": {"type": "string"},
                "mood": {"type": "string"},
            },
            "required": ["subject", "composition", "style", "lighting", "mood"],
            "additionalProperties": False,
        },
        "tags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "시각 요소·스타일 키워드 5~12개.",
        },
    },
    "required": [
        "goal",
        "targetAudience",
        "tone",
        "colorDirection",
        "layoutHints",
        "keyFeatures",
        "recreatePrompt",
        "stylePrompt",
        "summary",
        "visual",
        "tags",
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
                    "imagePrompt": {
                        "type": "string",
                        "description": "이 컨셉을 이미지 생성기에 넣을 한 문단 프롬프트.",
                    },
                    "stylePrompt": {
                        "type": "string",
                        "description": "이 컨셉의 룩앤필만 담은 한 문단.",
                    },
                    "tokens": DESIGN_TOKENS_SCHEMA,
                },
                "required": [
                    "conceptLabel",
                    "conceptName",
                    "description",
                    "imagePrompt",
                    "stylePrompt",
                    "tokens",
                ],
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
                    "kind": {
                        "type": "string",
                        "enum": ALLOWED_KINDS,
                        "description": "대상 화면의 아키타입. 모든 변형이 동일한 값이어야 한다.",
                    },
                    "title": {"type": "string", "description": "시안을 나타내는 짧은 한국어 제목."},
                    "variantLabel": {
                        "type": "string",
                        "description": "이 변형의 레이아웃 구조를 설명하는 한국어 한 구절. "
                        "예: '히어로 좌우 분할 + 우측 제품 프리뷰'.",
                    },
                    "imagePrompt": {
                        "type": "string",
                        "description": (
                            "이 변형을 이미지 생성기에 넣을 한 문단. "
                            "creativeDirections[i] 의 레이아웃·밀도·내비게이션·컴포넌트·강조를 반영한다."
                        ),
                    },
                    "sections": {
                        "type": "array",
                        "description": (
                            "이 시안이 위에서 아래로 담을 섹션 순서. Stage 4 Renderer 가 "
                            "이 뼈대를 그대로 그린다. 헤더에서 푸터까지 실제 페이지 한 벌을 "
                            "이룰 만큼(보통 6~10개) 채운다."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "description": "영문 소문자·하이픈 식별자. 예: 'hero', 'service-cards'.",
                                },
                                "role": {
                                    "type": "string",
                                    # 값은 아래 SECTION_ROLES 정의 뒤에 주입한다.
                                    "enum": [],
                                    "description": "섹션의 구조적 역할.",
                                },
                                "heading": {
                                    "type": "string",
                                    "description": "그 섹션에 실제로 들어갈 한국어 문구. 더미 텍스트 금지.",
                                },
                                "note": {
                                    "type": "string",
                                    "description": "배치·구성 지시 한 구절. 예: '카드 4열, 각 카드에 사진 배경'.",
                                },
                            },
                            "required": ["id", "role", "heading", "note"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["kind", "title", "variantLabel", "imagePrompt", "sections"],
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


def validate_layouts(
    layouts: list[dict[str, Any]], variants: int, expected_kind: str | None = None
) -> None:
    """시안은 **동일 화면의 구조 변형**이라는 정의를 강제한다.

    (기획서 v0.5.0 §4 F-002 — 시안은 서로 다른 화면의 집합이 아니다.)
      · 개수는 요청한 변형 수와 정확히 일치한다.
      · 모든 변형의 kind 는 대상 화면 하나로 동일하다.
      · 변형 라벨은 중복되지 않는다 (구조가 실제로 달라야 한다).
    """
    if len(layouts) != variants:
        raise ValueError(f"expected {variants} layouts, got {len(layouts)}")

    kinds = {layout["kind"] for layout in layouts}
    if len(kinds) != 1:
        raise ValueError(
            f"layouts must all target one screen, got kinds={sorted(kinds)}"
        )
    if expected_kind is not None and kinds != {expected_kind}:
        raise ValueError(
            f"expected all layouts to target '{expected_kind}', got {sorted(kinds)}"
        )

    labels = [str(layout.get("variantLabel", "")).strip() for layout in layouts]
    if any(not label for label in labels):
        raise ValueError("every layout needs a non-empty variantLabel")
    if len(set(labels)) != len(labels):
        raise ValueError(f"duplicate variantLabel in layouts: {labels}")


# ── Stage 4 · Renderer ────────────────────────────────────────────────
# 시안은 한 화면 프레임이 아니라 위에서 아래로 읽히는 완성 페이지다. 아래
# 역할 목록이 그 페이지를 이루는 섹션의 어휘이며, 레퍼런스 실무 시안(공공기관
# 포털·서비스 랜딩)에서 반복적으로 나타나는 구성을 그대로 옮긴 것이다.
SECTION_ROLES = [
    "topBar",          # 공지·긴급 안내 띠
    "globalNav",       # 로고 + 주 메뉴 + 로그인/회원가입
    "hero",            # 키비주얼 + 대표 문구 (+ 검색·주요 동작)
    "quickLinks",      # 바로가기 칩·아이콘 묶음
    "featureCards",    # 서비스·기능 카드 그리드
    "processSteps",    # 단계 안내 (1단계~N단계)
    "mediaRow",        # 영상·이미지 가로 나열
    "noticeBoard",     # 공지·자료 목록 (탭 포함)
    "statHighlight",   # 수치·성과 강조
    "loginPanel",      # 로그인·인증 박스
    "banner",          # 프로모션·안내 배너
    "gallery",         # 사진 갤러리
    "faq",             # 자주 묻는 질문
    "cta",             # 전환 유도 구역
    "partnerStrip",    # 패밀리사이트·로고 스트립
    "footer",          # 기관·회사 정보, 약관, 카피라이트
]

# 스키마 정의 시점에 SECTION_ROLES 가 필요해 위에서 참조하므로, 모듈을
# 읽는 순서상 여기서 다시 주입한다.
LAYOUTS_SCHEMA["properties"]["layouts"]["items"]["properties"]["sections"]["items"][
    "properties"
]["role"]["enum"] = SECTION_ROLES

IMAGE_ASPECTS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]

RENDER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "html": {
            "type": "string",
            "description": (
                "시안 한 벌의 완성 마크업. 최상위에 <style> 하나와 섹션들을 두는 "
                "조각(fragment)이며 <html>·<head>·<body> 는 쓰지 않는다."
            ),
        },
        "imageSlots": {
            "type": "array",
            "description": "html 안의 {{img:id}} 자리표시자마다 하나씩.",
            "items": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "html 의 {{img:id}} 와 정확히 일치하는 식별자.",
                    },
                    "prompt": {
                        "type": "string",
                        "description": (
                            "이 자리에 들어갈 이미지를 생성기에 넣을 한 문단. "
                            "피사체·구도·색·질감을 적고 화면 안 글자는 요구하지 않는다."
                        ),
                    },
                    "alt": {"type": "string", "description": "한국어 대체 텍스트."},
                    "aspect": {"type": "string", "enum": IMAGE_ASPECTS},
                },
                "required": ["id", "prompt", "alt", "aspect"],
                "additionalProperties": False,
            },
        },
        "pageHeight": {
            "type": "integer",
            "description": "1440px 폭에서 예상되는 전체 세로 픽셀. 대략치면 된다.",
        },
    },
    "required": ["html", "imageSlots", "pageHeight"],
    "additionalProperties": False,
}


def validate_render(result: dict[str, Any]) -> None:
    """스키마가 형태만 보장하는 부분을 실제 계약으로 좁힌다."""
    html = result.get("html")
    if not isinstance(html, str) or len(html.strip()) < 400:
        raise ValueError("renderer returned no usable html")
    # `<header` 가 `<head` 를 품으므로 단어 경계로 본다 — 접두 일치로 검사하면
    # 정상 마크업이 통째로 거절된다.
    document_tag = re.search(r"<!doctype|<\s*(?:html|head|body)\b", html, re.IGNORECASE)
    if document_tag:
        raise ValueError(f"renderer returned a full document ({document_tag.group(0)})")
    slots = result.get("imageSlots")
    if not isinstance(slots, list):
        raise ValueError("imageSlots must be a list")
    seen: set[str] = set()
    for slot in slots:
        slot_id = slot.get("id", "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,60}", slot_id):
            raise ValueError(f"invalid image slot id: {slot_id!r}")
        if slot_id in seen:
            raise ValueError(f"duplicate image slot id: {slot_id}")
        seen.add(slot_id)
