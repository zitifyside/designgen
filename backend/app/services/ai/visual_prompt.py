"""코덱스 이미지 생성기의 프롬프트 추출·변형 규칙을 designgen 에 이식한다.

참고 (설치본 app.asar):
  - extractPromptFromImage : recreatePrompt + stylePrompt + analysis + tags
  - promptBuilders.creativeDirectionForTake : 구도·카메라·조명·무드·배경을
    시안마다 결정론적으로 갈라 같은 프롬프트에서 시각적으로 다른 장을 뽑는다.

이미지가 없어도 사용자 원문 프롬프트에서 같은 구조의 비주얼 브리프를 뽑고,
레이아웃 단계에 장별 연출 방향을 주입한다.
"""
from __future__ import annotations

from typing import Any

VISUAL_FIELDS = ("subject", "composition", "style", "lighting", "mood")

COMPOSITION_DIRECTIONS = (
    "삼분할 비대칭 + 의도적 여백",
    "중앙 아이코닉 실루엣",
    "대각선 전경-후경 흐름",
    "디테일 크롭, 주제는 온전히 읽히게",
    "넓은 구도로 공간 맥락을 세움",
    "전경·중경·후경이 분명한 레이어",
    "굵은 덩어리의 포스터형 구성",
    "한쪽 무게 + 의미 있는 보조 요소",
)

CAMERA_DIRECTIONS = (
    "아이레벨 자연 시점",
    "살짝 낮은 시점으로 존재감",
    "살짝 높은 시점으로 형태가 읽히게",
    "3/4 시점으로 깊이",
    "정면·직교에 가까운 시점",
    "망원 압축 원근",
    "약간 넓은 화각, 왜곡은 절제",
    "피사체에 가까운 친밀 시점",
)

LIGHTING_DIRECTIONS = (
    "부드러운 하이키 확산광",
    "절제된 대비의 측면광",
    "약한 역광과 깨끗한 림라이트",
    "흐린 날 같은 넓은 조명",
    "초점 있는 키라이트 + 낮은 필",
    "따뜻한 키 + 차가운 앰비언트",
    "차가운 키 + 절제된 웜 액센트",
    "하이라이트가 통제된 스튜디오광",
)

MOOD_DIRECTIONS = (
    "차분하고 정밀한",
    "자신감 있고 에너지 있는",
    "따뜻하고 다가가기 쉬운",
    "고급스럽고 절제된",
    "장난스럽되 정돈된",
    "시네마틱하지만 읽히는",
    "신선하고 낙관적인",
    "기술적이고 다듬어진",
)

BACKGROUND_DIRECTIONS = (
    "숨 쉴 공간이 큰 미니멀 배경",
    "주제를 해치지 않는 부드러운 환경",
    "큰 도형 몇 개의 그래픽 배경",
    "깊이 힌트 하나인 톤 배경",
    "맥락은 남기되 덩어리로 단순화",
    "의도적 네거티브 스페이스",
    "절제된 질감의 대기 배경",
    "보조 리듬 하나인 에디토리얼 배경",
)

PROMPT_EXTRACT_VISUAL = (
    "당신은 이미지 생성용 프롬프트를 추출하는 비주얼 분석가다. "
    "코덱스 이미지 생성기와 같이, 나중에 이미지 생성기에 그대로 넣을 수 있는 "
    "문단형 프롬프트를 뽑는다. 사이트 IA 나 목업 페이지 구조를 추론하지 마라. "
    "recreatePrompt 는 피사체·구도·스타일·조명·색·무드를 한 문단으로 적는다 "
    "(줄바꿈·마크다운·번호 금지). stylePrompt 는 룩앤필만 — 팔레트·조명·무드·"
    "매체/기법·구도 언어 — 구체 피사체 이름은 넣지 마라. summary 는 한 문장. "
    "visual 은 subject/composition/style/lighting/mood 짧은 구. tags 는 시각 "
    "요소·스타일 키워드 5~12개(각 30자 미만). 한국어. 사용자 원문을 빼먹지 마라."
)

VISUAL_OBJECT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {k: {"type": "string"} for k in VISUAL_FIELDS},
    "required": list(VISUAL_FIELDS),
    "additionalProperties": False,
}


def _fnv1a(text: str) -> int:
    hash_ = 2166136261
    for ch in text:
        hash_ ^= ord(ch)
        hash_ = (hash_ * 16777619) & 0xFFFFFFFF
    return hash_


def _gcd(left: int, right: int) -> int:
    while right:
        left, right = right, left % right
    return abs(left) or 1


def _coprime_stride(seed: str, length: int) -> int:
    if length <= 1:
        return 1
    stride = max(1, _fnv1a(f"creative-direction-stride\0{seed}") % length)
    while _gcd(stride, length) != 1:
        stride += 1
        if stride >= length:
            stride = 1
    return stride


def _mixed_radix(index: int, lengths: list[int]) -> list[int]:
    remainder = max(0, int(index))
    digits: list[int] = []
    for length in lengths:
        digits.append(remainder % length)
        remainder //= length
    return digits


def creative_direction_for(seed: str, take_index: int) -> str:
    """시안 번호마다 구도·카메라·조명·무드·배경을 갈라 준다."""
    take = max(1, int(take_index))
    sets = [
        COMPOSITION_DIRECTIONS,
        CAMERA_DIRECTIONS,
        LIGHTING_DIRECTIONS,
        MOOD_DIRECTIONS,
        BACKGROUND_DIRECTIONS,
    ]
    cycle = 1
    for group in sets:
        cycle *= len(group)
    offset = _fnv1a(f"creative-direction-offset\0{seed}") % cycle
    stride = _coprime_stride(seed, cycle)
    combo = (offset + (take - 1) * stride) % cycle
    indexes = _mixed_radix(combo, [len(group) for group in sets])
    return (
        f"구도: {COMPOSITION_DIRECTIONS[indexes[0]]}; "
        f"카메라: {CAMERA_DIRECTIONS[indexes[1]]}; "
        f"조명: {LIGHTING_DIRECTIONS[indexes[2]]}; "
        f"무드: {MOOD_DIRECTIONS[indexes[3]]}; "
        f"배경: {BACKGROUND_DIRECTIONS[indexes[4]]}"
    )


def creative_directions_for(seed: str, count: int) -> list[str]:
    n = max(1, int(count))
    return [creative_direction_for(seed, i + 1) for i in range(n)]


def _clip(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit].strip()


def normalize_visual_brief(raw: dict[str, Any] | None) -> dict[str, Any]:
    """모델 출력에서 코덱스 추출 스키마만 남긴다. 없으면 빈 칸."""
    src = raw if isinstance(raw, dict) else {}
    nested = src.get("visual") if isinstance(src.get("visual"), dict) else {}
    analysis = src.get("analysis") if isinstance(src.get("analysis"), dict) else {}
    visual = {}
    for key in VISUAL_FIELDS:
        visual[key] = _clip(nested.get(key) or analysis.get(key) or src.get(key), 300)
    tags_raw = src.get("tags") or []
    tags: list[str] = []
    if isinstance(tags_raw, list):
        for item in tags_raw:
            tag = _clip(item, 30)
            if tag and tag not in tags:
                tags.append(tag)
            if len(tags) >= 12:
                break
    return {
        "recreatePrompt": _clip(src.get("recreatePrompt"), 4000),
        "stylePrompt": _clip(src.get("stylePrompt"), 4000),
        "summary": _clip(src.get("summary"), 400),
        "visual": visual,
        "tags": tags,
    }


def apply_visual_brief(analysis: dict[str, Any], brief: dict[str, Any]) -> dict[str, Any]:
    """분석 dict 에 정규화한 브리프를 덮어 다음 단계가 같은 키를 보게 한다."""
    merged = dict(analysis)
    merged["recreatePrompt"] = brief["recreatePrompt"]
    merged["stylePrompt"] = brief["stylePrompt"]
    merged["summary"] = brief["summary"]
    merged["visual"] = brief["visual"]
    merged["tags"] = brief["tags"]
    merged["visualBrief"] = brief
    return merged
