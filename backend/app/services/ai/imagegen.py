"""시안 안 이미지 슬롯을 실제 그림으로 채운다.

Stage 4 가 돌려준 마크업에는 `{{img:hero}}` 같은 자리표시자가 남아 있다.
여기서 슬롯마다 이미지를 생성해 DB 에 저장하고, 자리표시자를 그 이미지의
공개 경로로 바꾼다.

**이미지 실패는 시안 실패가 아니다.** 사진이 한 장 빠져도 레이아웃·색·
타이포·카피는 그대로 서 있고, 그게 시안의 본체다. 그래서 슬롯 하나가
실패하면 그 자리만 은은한 그라디언트로 대체하고 나머지는 계속 간다 —
전체를 Fallback 으로 떨어뜨리면 멀쩡한 페이지를 컨셉 보드로 되돌리는
꼴이 된다.

채널은 Cloud Run 에서도 부를 수 있는 API 경로만 쓴다. Grok·Codex CLI 는
운영 컨테이너에 없으므로 사다리에 넣지 않는다.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import re
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

#: 슬롯 하나가 이 시간을 넘기면 포기한다. 시안 전체가 이미지 한 장을
#: 기다리느라 생성이 늘어지는 편보다, 빠진 채로 보여 주는 편이 낫다.
SLOT_TIMEOUT_SECONDS = 90

#: 동시에 굽는 장수. 너무 올리면 레이트리밋에 걸려 전부 실패한다.
SLOT_CONCURRENCY = 3

ASPECT_SIZES: dict[str, tuple[int, int]] = {
    "21:9": (1536, 640),
    "16:9": (1408, 768),
    "4:3": (1280, 960),
    "1:1": (1024, 1024),
    "3:4": (960, 1280),
    "9:16": (768, 1408),
}

#: 생성 프롬프트에 항상 덧붙이는 제약. 시안 안의 글자는 HTML 이 그리므로
#: 이미지에 글자가 섞이면 두 겹으로 겹쳐 읽히고, 한글은 특히 뭉개진다.
PROMPT_SUFFIX = (
    " 사진처럼 자연스러운 실사 이미지. 화면 안에 글자·로고·워터마크·UI 요소를 "
    "넣지 말 것. 가장자리에 여백을 두어 잘려도 주제가 살아 있게 할 것."
)


_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def fallback_gradient(slot: dict[str, Any], tokens: dict[str, Any] | None = None) -> str:
    """생성 실패한 자리를 메울 그라디언트 data URI.

    회색 상자를 두지 않는 이유는 그것이 정확히 "목업처럼 보이는" 신호이기
    때문이다. 다만 아무 색이나 쓰면 더 나쁘다 — 갈색 팔레트의 시안에 보라
    그라디언트가 박히면 사진이 없는 것보다 눈에 거슬린다. 그래서 **그 컨셉의
    토큰 색**에서 두 색을 가져오고, 슬롯마다 방향만 바꿔 단조로움을 던다.
    """
    color = (tokens or {}).get("color") or {}
    start = color.get("primary") if _HEX.match(str(color.get("primary", ""))) else "#6B5B4E"
    end = color.get("secondary") if _HEX.match(str(color.get("secondary", ""))) else "#3E332B"
    # 슬롯 이름으로 각도만 가른다. 색은 컨셉이 정하고 배치는 슬롯이 정한다.
    angle = sum(ord(c) for c in slot.get("id", "")) % 4
    x2, y2 = ((1, 1), (1, 0), (0, 1), (1, 0.4))[angle]
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="{x2}" y2="{y2}">'
        f'<stop offset="0" stop-color="{start}"/>'
        f'<stop offset="1" stop-color="{end}"/>'
        f"</linearGradient></defs>"
        f'<rect width="16" height="9" fill="url(#g)"/></svg>'
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def model_pool() -> list[str]:
    """이미지를 나눠 맡을 모델 목록.

    한 모델이 시안의 사진을 전부 그리면 화풍이 한 벌로 굳고, 그 모델이 막히는
    순간 그림이 전멸한다. 풀을 나누면 화풍에 폭이 생기고 실패도 분산된다.
    """
    raw = [m.strip() for m in (settings.image_model_pool or "").split(",")]
    pool = [m for m in raw if m]
    return pool or [settings.gemini_image_model]


def assign_models(slots: list[dict[str, Any]]) -> list[tuple[dict[str, Any], str]]:
    """슬롯에 모델을 배정한다 — 모델 하나가 `image_slots_per_model` 장씩 맡는다.

    풀이 슬롯보다 짧으면 처음으로 돌아가 다시 돈다.
    """
    pool = model_pool()
    per = max(1, min(int(settings.image_slots_per_model or 1), 2))
    assigned: list[tuple[dict[str, Any], str]] = []
    for index, slot in enumerate(slots):
        assigned.append((slot, pool[(index // per) % len(pool)]))
    return assigned


async def _generate_gemini(prompt: str, aspect: str, model: str) -> tuple[bytes, str]:
    """Gemini 이미지 모델 한 장. (bytes, mime) 반환."""
    from google import genai  # 지연 임포트 — 키가 없어도 앱은 떠야 한다.
    from google.genai import types

    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not set — cannot generate images.")

    width, height = ASPECT_SIZES.get(aspect, ASPECT_SIZES["16:9"])
    client = genai.Client(api_key=settings.gemini_api_key)
    response = await client.aio.models.generate_content(
        model=model,
        contents=f"{prompt}{PROMPT_SUFFIX} 가로 {width}px, 세로 {height}px 비율.",
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    for candidate in response.candidates or []:
        for part in getattr(candidate.content, "parts", None) or []:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                return inline.data, inline.mime_type or "image/png"
    raise RuntimeError("Gemini returned no image data")


async def generate_slot_image(
    slot: dict[str, Any], model: str | None = None
) -> tuple[bytes, str] | None:
    """슬롯 한 장. 실패하면 None — 예외를 위로 올리지 않는다."""
    prompt = (slot.get("prompt") or "").strip()
    if not prompt:
        return None
    chosen = model or settings.gemini_image_model
    try:
        return await asyncio.wait_for(
            _generate_gemini(prompt, slot.get("aspect") or "16:9", chosen),
            timeout=SLOT_TIMEOUT_SECONDS,
        )
    except Exception as exc:  # noqa: BLE001 — 한 장의 실패로 시안을 버리지 않는다.
        logger.warning(
            "image slot generation failed",
            extra={"slot": slot.get("id"), "model": chosen, "error": str(exc)[:200]},
        )
        return None


async def generate_slot_images(slots: list[dict[str, Any]]) -> dict[str, tuple[bytes, str]]:
    """슬롯 여러 장을 제한된 동시성으로 굽는다. 성공한 것만 담아 돌려준다."""
    if not slots:
        return {}
    gate = asyncio.Semaphore(SLOT_CONCURRENCY)

    async def _one(
        slot: dict[str, Any], model: str
    ) -> tuple[str, tuple[bytes, str] | None]:
        async with gate:
            return slot.get("id", ""), await generate_slot_image(slot, model)

    results = await asyncio.gather(
        *(_one(slot, model) for slot, model in assign_models(slots))
    )
    return {slot_id: data for slot_id, data in results if slot_id and data}


def images_enabled() -> bool:
    """이미지 생성을 시도할 수 있는 상태인지."""
    return bool(settings.mockup_images_enabled and settings.gemini_api_key)
