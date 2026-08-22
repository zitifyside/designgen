"""Stage 4 · Renderer 의 provider 공통 부분.

provider 마다 다른 것은 **모델을 어떻게 호출하는가** 하나뿐이고, 무엇을
넘기고 무엇을 돌려받아 어떻게 검사하는지는 같다. 그 공통분을 여기 두어
codex·gemini 가 각자 복제하지 않게 한다.

돌려받은 마크업은 곧바로 DB 에 넣지 않는다. 순서는 검증 → 살균 →
슬롯 정합이다. 살균을 마지막에 두면 살균이 지운 요소 때문에 슬롯 목록이
어긋난 채 저장되고, 화면에는 채울 수 없는 자리표시자가 남는다.
"""
from __future__ import annotations

from typing import Any

from app.services.ai.html_sanitize import collect_image_slots, sanitize_mockup_html
from app.services.ai.schemas import validate_render

#: 렌더러가 참조할 CSS 변수 이름 — 프론트가 실제로 주입하는 것과 같아야 한다.
TOKEN_VAR_HINT = (
    "--ds-color-primary, --ds-color-secondary, --ds-color-bg, --ds-color-surface, "
    "--ds-color-text, --ds-color-text-muted, --ds-color-border, --ds-font-family, "
    "--ds-font-size-base, --ds-font-size-lg, --ds-line-height, --ds-letter-spacing, "
    "--ds-space-1 ~ --ds-space-8, --ds-radius-sm/md/lg, --ds-shadow-sm/md"
)


def build_render_payload(layout: dict[str, Any], tokens: dict[str, Any]) -> dict[str, Any]:
    """Stage 4 에 넘길 입력. 모델이 페이지를 그리는 데 필요한 것만 담는다."""
    tree = layout.get("nodeTree") or {}
    return {
        "title": layout.get("title", ""),
        "variantLabel": layout.get("variantLabel", ""),
        "kind": layout.get("kind", "main"),
        "screenTitle": layout.get("screenTitle", ""),
        "sections": layout.get("sections") or [],
        "creativeDirection": tree.get("creativeDirection", ""),
        "stylePrompt": tree.get("stylePrompt", ""),
        "imagePrompt": tree.get("imagePrompt", ""),
        "tokens": tokens,
        "cssVariables": TOKEN_VAR_HINT,
        "viewportWidth": 1440,
    }


def finalize_render(result: dict[str, Any]) -> dict[str, Any]:
    """모델 출력을 저장 가능한 형태로 좁힌다.

    슬롯은 **마크업에 실제로 남아 있는 것**을 진실로 삼는다. 모델이 선언만
    하고 본문에 안 쓴 슬롯은 이미지를 생성해도 놓일 자리가 없어 비용만
    나가고, 반대로 본문에만 있는 슬롯은 프롬프트가 없으므로 대체 문구를
    지어 준다.
    """
    validate_render(result)
    html = sanitize_mockup_html(result["html"])

    declared = {
        slot["id"]: slot
        for slot in result.get("imageSlots") or []
        if isinstance(slot, dict) and slot.get("id")
    }
    present = collect_image_slots(html)

    slots: list[dict[str, Any]] = []
    for slot_id in present:
        declared_slot = declared.get(slot_id) or {}
        slots.append(
            {
                "id": slot_id,
                "prompt": str(declared_slot.get("prompt") or "").strip()
                or f"{slot_id} 자리에 어울리는 사진. 사람·사물·풍경 중 장면에 맞는 것을 고르고, 화면 안에 글자는 넣지 않는다.",
                "alt": str(declared_slot.get("alt") or "").strip() or "이미지",
                "aspect": declared_slot.get("aspect") or "16:9",
            }
        )

    page_height = result.get("pageHeight")
    if not isinstance(page_height, int) or page_height <= 0:
        page_height = 0

    return {"html": html, "imageSlots": slots, "pageHeight": page_height}
