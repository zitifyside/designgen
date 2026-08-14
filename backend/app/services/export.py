"""Export 산출물 생성기.

기능정의서 v0.2.0 §3.1 Export 형식 4종을 지원한다.
  · .json : W3C DTCG 표준 JSON (실산출)
  · .css  : CSS Variables (실산출)
  · .fig  : Figma 호환 — Plugin API 직접 생성이 불가하므로 SVG + 메타데이터로
            대체한다 (기획서 v0.5.0 §4 F-006 제약사항이 명시한 대체 경로).
  · .png  : 시안 미리보기. v1.0 개발 빌드는 동일한 SVG + 메타데이터 경로를 쓰며,
            래스터 변환은 Export Phase(W11~12) 산출물이다.

Free 등급 PNG 는 워터마크가 강제된다 (기능정의서 v0.2.0 §3.1).
"""
from __future__ import annotations

import json
from typing import Any

# Export 형식별 등급 게이팅 — .fig·.json·.css 는 Pro 이상.
PRO_ONLY_FORMATS = ("fig", "json", "css")
PRO_PLANS = ("Pro", "Team", "Admin")

CONTENT_TYPES = {
    "json": "application/json; charset=utf-8",
    "css": "text/css; charset=utf-8",
    "fig": "image/svg+xml; charset=utf-8",
    "png": "image/svg+xml; charset=utf-8",
}

FILE_SUFFIX = {"json": "json", "css": "css", "fig": "svg", "png": "svg"}

_DTCG_TYPE = {
    "color": "color",
    "typography": "typography",
    "spacing": "dimension",
    "border": "dimension",
    "shadow": "shadow",
    "components": "other",
}


def to_dtcg(tokens: dict[str, Any]) -> dict[str, Any]:
    """내부 Token 트리를 W3C DTCG 표준 JSON 으로 변환한다."""

    def wrap(value: Any, group: str) -> Any:
        if isinstance(value, dict):
            return {k: wrap(v, group) for k, v in value.items()}
        return {"$value": value, "$type": _DTCG_TYPE.get(group, "other")}

    return {
        "$schema": "https://design-tokens.github.io/community-group/format/",
        **{group: wrap(value, group) for group, value in (tokens or {}).items()},
    }


def to_css_variables(tokens: dict[str, Any]) -> str:
    """CSS Variables 문자열로 직렬화한다."""
    lines: list[str] = [":root {"]

    def walk(node: Any, path: list[str]) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                walk(value, [*path, _kebab(key)])
            return
        lines.append(f"  --{'-'.join(path)}: {node};")

    walk(tokens or {}, ["ds"])
    lines.append("}")
    return "\n".join(lines) + "\n"


def _kebab(value: str) -> str:
    out: list[str] = []
    for ch in value:
        if ch.isupper():
            out.append("-")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out)


def build_svg_preview(
    *,
    project_name: str,
    concept_name: str,
    tokens: dict[str, Any],
    mockups: list[dict[str, Any]],
    watermark: bool,
) -> str:
    """DS 팔레트 + 시안 구조 목록을 담은 SVG + 메타데이터 산출물."""
    color = (tokens or {}).get("color", {})
    swatches = [
        (name, value)
        for name, value in color.items()
        if isinstance(value, str) and value.startswith("#")
    ][:8]

    width, height = 960, 540
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" font-family="Inter, sans-serif">',
        f'<rect width="{width}" height="{height}" fill="{color.get("background", "#F8FAFC")}"/>',
        f'<text x="48" y="72" font-size="30" font-weight="700" '
        f'fill="{color.get("text", "#0F172A")}">{_escape(project_name)}</text>',
        f'<text x="48" y="104" font-size="16" fill="{color.get("textMuted", "#64748B")}">'
        f'{_escape(concept_name)} · Design System Export</text>',
    ]

    for i, (name, value) in enumerate(swatches):
        x = 48 + (i % 4) * 224
        y = 140 + (i // 4) * 108
        parts.append(
            f'<rect x="{x}" y="{y}" width="200" height="64" rx="10" fill="{value}"/>'
        )
        parts.append(
            f'<text x="{x}" y="{y + 84}" font-size="13" '
            f'fill="{color.get("textMuted", "#64748B")}">{_escape(name)} · {value}</text>'
        )

    parts.append(
        f'<text x="48" y="392" font-size="16" font-weight="600" '
        f'fill="{color.get("text", "#0F172A")}">시안 구조 변형</text>'
    )
    for i, m in enumerate(mockups[:5]):
        label = f'{m.get("title", "")} — {m.get("variantLabel", "")}'.strip(" —")
        parts.append(
            f'<text x="48" y="{422 + i * 22}" font-size="13" '
            f'fill="{color.get("textMuted", "#64748B")}">· {_escape(label)}</text>'
        )

    if watermark:
        parts.append(
            f'<text x="{width - 32}" y="{height - 28}" text-anchor="end" font-size="22" '
            f'font-weight="700" fill="{color.get("text", "#0F172A")}" opacity="0.28">'
            "AI Design Generator · Free</text>"
        )

    parts.append("</svg>")
    return "\n".join(parts)


def build_metadata(
    *,
    project_name: str,
    concept_label: str,
    tokens: dict[str, Any],
    mockups: list[dict[str, Any]],
) -> str:
    return json.dumps(
        {
            "project": project_name,
            "concept": concept_label,
            "mockups": mockups,
            "tokens": to_dtcg(tokens),
        },
        ensure_ascii=False,
        indent=2,
    )


def _escape(value: str) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
