"""FAKE_AI_PIPELINE=true일 때 사용되는 결정론적 placeholder 출력.

프론트엔드의 목 컨셉(Modern Minimal / Bold Vibrant / Soft Pastel)과 5가지
목업 종류를 그대로 반영하여, 실제 Gemini / Codex 프롬프트가 작성되기 전에도
앱 전체를 처음부터 끝까지 실행할 수 있게 한다.
"""
from __future__ import annotations

CONCEPTS = [
    {
        "conceptLabel": "A",
        "conceptName": "Modern Minimal",
        "description": "낮은 채도·넓은 여백·중성 컬러 중심. 차분하고 신뢰감 있는 무드.",
        "tokens": {
            "color": {
                "primary": "#2563EB", "secondary": "#0EA5E9", "neutral": "#64748B",
                "background": "#F8FAFC", "surface": "#FFFFFF", "text": "#0F172A",
                "textMuted": "#64748B", "success": "#16A34A", "warning": "#D97706",
                "error": "#DC2626", "info": "#2563EB",
            },
            "typography": {
                "fontFamily": "Inter", "baseSize": 14, "scale": 1.25,
                "weights": {"regular": 400, "medium": 500, "bold": 700},
                "lineHeight": 1.55, "letterSpacing": -0.005,
            },
            "spacing": {"baseUnit": 8},
            "border": {"width": 1, "radiusSm": 6, "radiusMd": 10, "radiusLg": 16, "style": "solid"},
            "shadow": {"preset": "sm"},
            "components": {"buttonVariant": "rounded", "inputStyle": "outlined", "cardElevation": "outlined"},
        },
    },
    {
        "conceptLabel": "B",
        "conceptName": "Bold Vibrant",
        "description": "강한 채도·굵은 타이포·진한 그림자. 임팩트 있는 첫인상 중심.",
        "tokens": {
            "color": {
                "primary": "#F97316", "secondary": "#9333EA", "neutral": "#111827",
                "background": "#0F172A", "surface": "#1E293B", "text": "#F8FAFC",
                "textMuted": "#94A3B8", "success": "#22D3EE", "warning": "#FACC15",
                "error": "#F43F5E", "info": "#A855F7",
            },
            "typography": {
                "fontFamily": "Inter", "baseSize": 16, "scale": 1.333,
                "weights": {"regular": 500, "medium": 700, "bold": 900},
                "lineHeight": 1.4, "letterSpacing": -0.015,
            },
            "spacing": {"baseUnit": 12},
            "border": {"width": 2, "radiusSm": 4, "radiusMd": 8, "radiusLg": 12, "style": "solid"},
            "shadow": {"preset": "lg"},
            "components": {"buttonVariant": "square", "inputStyle": "filled", "cardElevation": "raised"},
        },
    },
    {
        "conceptLabel": "C",
        "conceptName": "Soft Pastel",
        "description": "파스텔 컬러·둥근 모서리·따뜻한 무드. 친근하고 부드럽게.",
        "tokens": {
            "color": {
                "primary": "#EC4899", "secondary": "#A78BFA", "neutral": "#78716C",
                "background": "#FFF7ED", "surface": "#FFFFFF", "text": "#44403C",
                "textMuted": "#A8A29E", "success": "#86EFAC", "warning": "#FDE68A",
                "error": "#FCA5A5", "info": "#BFDBFE",
            },
            "typography": {
                "fontFamily": "Inter", "baseSize": 15, "scale": 1.2,
                "weights": {"regular": 400, "medium": 600, "bold": 700},
                "lineHeight": 1.65, "letterSpacing": 0,
            },
            "spacing": {"baseUnit": 10},
            "border": {"width": 1, "radiusSm": 12, "radiusMd": 20, "radiusLg": 28, "style": "solid"},
            "shadow": {"preset": "md"},
            "components": {"buttonVariant": "pill", "inputStyle": "filled", "cardElevation": "raised"},
        },
    },
]

MOCKUP_KINDS = [
    {"kind": "landing", "title": "랜딩 페이지"},
    {"kind": "dashboard", "title": "대시보드"},
    {"kind": "pricing", "title": "Pricing"},
    {"kind": "signup", "title": "회원가입"},
    {"kind": "settings", "title": "설정"},
]


def placeholder_concepts(n: int) -> list[dict]:
    return [dict(c) for c in CONCEPTS[: max(1, min(n, len(CONCEPTS)))]]


def placeholder_layouts(variants: int) -> list[dict]:
    kinds = MOCKUP_KINDS[: max(1, min(variants, len(MOCKUP_KINDS)))]
    return [{"kind": k["kind"], "title": k["title"], "nodeTree": None} for k in kinds]
