"""코덱스 이미지 생성기의 프롬프트 추출·변형 규칙을 designgen 에 이식한다.

참고 (설치본 app.asar):
  - extractPromptFromImage : recreatePrompt + stylePrompt + analysis + tags
  - promptBuilders.creativeDirectionForTake : 시안마다 연출 축을 결정론적으로
    갈라 같은 프롬프트에서 서로 다른 장을 뽑는다.

이미지가 없어도 사용자 원문 프롬프트에서 같은 구조의 비주얼 브리프를 뽑고,
레이아웃 단계에 시안별 연출 방향을 주입한다.

연출 축은 원본의 구도·카메라·조명·무드·배경을 그대로 쓰지 않는다. designgen 의
산출물은 래스터 이미지가 아니라 토큰 기반 화면이라 카메라·조명 축이 결과에
대응하지 않고, 무드 축은 컨셉(A·B·C)이 이미 소유한 정체성과 충돌한다. 그래서
한 컨셉 안에서 시안을 가르는 축을 구조 축 5종 — 레이아웃·밀도·내비게이션·
컴포넌트·강조 — 으로 재정의했다. 축 개수(5)와 축당 값 개수(8)는 원본과 같으므로
순환 길이 32,768 과 비반복 보장은 그대로 유지된다.
"""
from __future__ import annotations

from typing import Any

VISUAL_FIELDS = ("subject", "composition", "style", "lighting", "mood")

LAYOUT_DIRECTIONS = (
    "단일 컬럼 중심, 위에서 아래로 읽히는 흐름",
    "좌측 고정 사이드 + 우측 본문 2단",
    "상단 히어로 + 하단 카드 그리드",
    "12칼럼을 크게 나눈 비대칭 분할",
    "동일 비중 카드가 반복되는 균질 그리드",
    "좁은 본문 폭 + 넓은 여백의 중앙 정렬",
    "가로 스크롤 섹션이 섞인 혼합 배치",
    "상단 요약 + 접이식 상세의 계층 배치",
)

DENSITY_DIRECTIONS = (
    "핵심만 남긴 최소 밀도",
    "한 화면 한 과업의 낮은 밀도",
    "요약과 상세를 함께 보이는 중간 밀도",
    "표 중심의 높은 밀도",
    "지표를 촘촘히 모은 대시보드 밀도",
    "여백을 크게 둔 편집형 밀도",
    "목록은 조밀하게, 상세는 여유롭게",
    "단계별로 나눠 노출하는 점진 밀도",
)

NAVIGATION_DIRECTIONS = (
    "상단 가로 내비게이션",
    "좌측 세로 내비게이션",
    "하단 탭 바 중심 동선",
    "브레드크럼 + 계층 이동",
    "검색을 진입점으로 삼는 동선",
    "사이드 시트·드로어로 보조 이동",
    "단계 표시가 있는 순차 진행 동선",
    "카드 진입 후 되돌아오는 허브-스포크 동선",
)

COMPONENT_DIRECTIONS = (
    "테두리 없는 평면 카드",
    "그림자로 층을 나눈 입체 카드",
    "구분선 중심의 목록형",
    "둥근 모서리의 부드러운 컨테이너",
    "각진 모서리의 절제된 컨테이너",
    "칩·뱃지를 적극 쓰는 태그형",
    "아이콘 + 라벨 조합의 시각 단서형",
    "테이블·필드가 도드라지는 폼형",
)

EMPHASIS_DIRECTIONS = (
    "단일 주요 동작 버튼에 시선 집중",
    "숫자·지표를 가장 크게",
    "키비주얼을 앵커로 삼는 강조",
    "제목 타이포그래피로 위계 생성",
    "색 대비로 핵심 영역 구분",
    "여백 크기로 위계 생성",
    "상태 색(성공·경고)으로 주의 유도",
    "순서 번호로 시선 흐름 고정",
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
    """시안 번호마다 레이아웃·밀도·내비게이션·컴포넌트·강조를 갈라 준다."""
    take = max(1, int(take_index))
    sets = [
        LAYOUT_DIRECTIONS,
        DENSITY_DIRECTIONS,
        NAVIGATION_DIRECTIONS,
        COMPONENT_DIRECTIONS,
        EMPHASIS_DIRECTIONS,
    ]
    cycle = 1
    for group in sets:
        cycle *= len(group)
    offset = _fnv1a(f"creative-direction-offset\0{seed}") % cycle
    stride = _coprime_stride(seed, cycle)
    combo = (offset + (take - 1) * stride) % cycle
    indexes = _mixed_radix(combo, [len(group) for group in sets])
    return (
        f"레이아웃: {LAYOUT_DIRECTIONS[indexes[0]]}; "
        f"밀도: {DENSITY_DIRECTIONS[indexes[1]]}; "
        f"내비게이션: {NAVIGATION_DIRECTIONS[indexes[2]]}; "
        f"컴포넌트: {COMPONENT_DIRECTIONS[indexes[3]]}; "
        f"강조: {EMPHASIS_DIRECTIONS[indexes[4]]}"
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
