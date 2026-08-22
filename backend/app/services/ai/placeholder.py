"""FAKE_AI_PIPELINE=true일 때 사용되는 결정론적 placeholder 출력.

기획서 v0.5.0 §4 F-002 의 시안 정의를 컨셉 시안으로 해석한다 —
**시안은 완성 사이트 목업이 아니라, 단일 대표 장면의 컨셉 보드 변형이다.**
따라서 한 번의 생성은 (컨셉 N종) × (동일 장면의 시안 3·5종) 을 만든다.
기본 장면은 메인(키비주얼·팔레트·타이포)이다.

DS 생성 방식 2종도 여기서 분기한다.
  · per_concept : 컨셉마다 전 Token 카테고리를 독립 생성 (Primary Hue 60도 이상 구별)
  · unified     : Base Token 1벌 공통 고정 + 컨셉별 강조색만 변주 (강조색 Hue 60도 이상 구별)
"""
from __future__ import annotations

import colorsys

from app.models.project import DS_MODE_UNIFIED

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

# 요건 입력의 '대표 장면' 프리셋 (기능정의서 v0.2.0 §4.1 + 메인 컨셉 보드).
SCREEN_PRESETS: dict[str, str] = {
    "main": "메인",
    "landing": "랜딩",
    "login": "로그인",
    "dashboard": "대시보드",
    "list": "목록",
    "detail": "상세",
}

# 화면 아키타입별 구조 변형 라벨 — 시안은 이 축으로만 달라진다.
VARIANT_LABELS: dict[str, list[str]] = {
    "main": [
        "풀블리드 히어로 + 서비스 카드 4열",
        "좌우 분할 히어로 + 바로가기 그리드",
        "상단 안내 띠 + 검색 중심 히어로",
        "에디토리얼 키비주얼 + 2열 본문",
        "카드 우선 배치 + 히어로 축약",
        "세로 스토리 스크롤 + 구간별 색면 전환",
    ],
    "landing": [
        "히어로 중앙 정렬 + 3열 특징 카드",
        "히어로 좌우 분할 + 우측 제품 프리뷰",
        "상단 풀블리드 배너 + 2열 본문",
        "좌측 고정 내비 + 세로 스크롤 섹션",
        "카드 그리드 우선 + 히어로 축약",
        "지그재그 교차 섹션 + 하단 전환 유도",
    ],
    "login": [
        "중앙 단일 카드 + 소셜 로그인 상단",
        "좌우 분할 (브랜드 패널 + 폼)",
        "상단 로고 + 폭 넓은 단일 컬럼",
        "카드 없는 전면 폼 + 하단 보조 링크",
        "우측 폼 고정 + 좌측 이미지 배경",
        "상단 브랜드 배너 + 하단 2열 보조 안내",
    ],
    "dashboard": [
        "지표 4열 + 대형 차트 1 + 보조 1",
        "지표 2열 + 차트 2분할 균등",
        "좌측 사이드바 + 지표 3열",
        "상단 필터 바 + 표 중심 레이아웃",
        "카드 대시보드 (지표·차트 혼합 그리드)",
        "요약 헤더 + 좌측 지표·우측 활동 타임라인",
    ],
    "list": [
        "표 형식 + 상단 필터 바",
        "카드 그리드 3열",
        "좌측 필터 패널 + 우측 리스트",
        "밀집 리스트 + 우측 미리보기",
        "섹션 그룹 리스트 + 상단 탭",
        "히어로 검색 + 카테고리 타일 + 최신 목록",
    ],
    "detail": [
        "좌측 내비 + 우측 상세 카드",
        "상단 요약 + 탭 분할 본문",
        "2열 (본문 + 사이드 메타)",
        "단일 컬럼 롱폼 + 고정 액션 바",
        "히어로 요약 + 아코디언 섹션",
        "좌측 목차 고정 + 우측 롱폼 본문",
    ],
}

# 아키타입별 기본 섹션 뼈대. 모델이 sections 를 빠뜨려도 시안이 "한 화면짜리
# 컨셉 보드" 로 되돌아가지 않도록, 서버가 최소한의 페이지 골격을 강제한다.
def _section(sid: str, role: str, heading: str, note: str) -> dict:
    return {"id": sid, "role": role, "heading": heading, "note": note}


DEFAULT_SECTIONS: dict[str, list[dict]] = {
    "main": [
        _section("global-nav", "globalNav", "서비스 안내", "로고 좌측, 주 메뉴 5개, 우측 로그인·회원가입"),
        _section("hero", "hero", "필요한 정보를 한곳에서", "풀폭 키비주얼 사진 위 대형 제목과 검색창"),
        _section("quick-links", "quickLinks", "자주 찾는 서비스", "아이콘 칩 8개를 한 줄로"),
        _section("service-cards", "featureCards", "주요 서비스", "카드 4열, 각 카드 상단에 사진"),
        _section("process", "processSteps", "이용 절차", "1단계부터 5단계까지 가로 배열"),
        _section("notice", "noticeBoard", "공지사항", "탭 2개와 날짜가 붙은 목록 5줄"),
        _section("partners", "partnerStrip", "관련 사이트", "로고 7개를 한 줄로"),
        _section("footer", "footer", "기관 정보", "주소·대표전화·약관 링크·카피라이트"),
    ],
    "landing": [
        _section("global-nav", "globalNav", "제품 소개", "로고와 메뉴 4개, 우측에 시작하기 버튼"),
        _section("hero", "hero", "더 빠르게 시작하세요", "좌측 문구, 우측 제품 화면 이미지"),
        _section("logos", "partnerStrip", "함께하는 기업", "고객사 로고 6개"),
        _section("features", "featureCards", "핵심 기능", "카드 3열, 각 카드에 일러스트"),
        _section("stats", "statHighlight", "숫자로 보는 성과", "지표 3개를 크게"),
        _section("cta", "cta", "지금 무료로 시작하기", "중앙 정렬 버튼 2개"),
        _section("footer", "footer", "회사 정보", "메뉴 4열과 카피라이트"),
    ],
    "login": [
        _section("global-nav", "globalNav", "로그인", "로고만 있는 단순 헤더"),
        _section("hero", "hero", "다시 만나 반갑습니다", "좌측 브랜드 패널에 배경 사진"),
        _section("login-panel", "loginPanel", "로그인", "아이디·비밀번호 입력과 간편 로그인 3종"),
        _section("faq", "faq", "로그인에 문제가 있나요?", "질문 3개 접이식"),
        _section("footer", "footer", "고객센터", "대표전화와 약관 링크"),
    ],
    "dashboard": [
        _section("global-nav", "globalNav", "관리 콘솔", "좌측 세로 내비게이션"),
        _section("stats", "statHighlight", "오늘의 지표", "지표 카드 4열"),
        _section("charts", "mediaRow", "기간별 추이", "큰 차트 하나와 보조 차트 하나"),
        _section("table", "noticeBoard", "최근 활동", "표 형식 8줄"),
        _section("footer", "footer", "시스템 정보", "버전과 문의처"),
    ],
    "list": [
        _section("global-nav", "globalNav", "자료실", "로고와 메뉴, 우측 검색"),
        _section("hero", "hero", "자료 검색", "얇은 배너 위 검색 필드"),
        _section("filters", "quickLinks", "분류", "필터 칩 한 줄"),
        _section("items", "featureCards", "전체 자료", "카드 3열 9개, 각 카드에 썸네일"),
        _section("footer", "footer", "기관 정보", "주소와 카피라이트"),
    ],
    "detail": [
        _section("global-nav", "globalNav", "상세 보기", "로고와 메뉴, 브레드크럼"),
        _section("hero", "hero", "문서 제목", "제목·작성일·분류 배지"),
        _section("body", "noticeBoard", "본문", "본문 단락과 표 하나"),
        _section("gallery", "gallery", "첨부 이미지", "사진 3장 가로 배열"),
        _section("cta", "cta", "목록으로 돌아가기", "하단 액션 버튼 2개"),
        _section("footer", "footer", "기관 정보", "주소와 카피라이트"),
    ],
}


# 자유 입력 화면명 → 아키타입 추론 키워드.
_ARCHETYPE_HINTS: list[tuple[tuple[str, ...], str]] = [
    (("로그인", "login", "signin", "sign in", "가입", "signup", "인증", "auth"), "login"),
    (("대시보드", "dashboard", "통계", "분석", "analytics", "리포트", "report"), "dashboard"),
    (("목록", "리스트", "list", "table", "표", "검색", "search", "관리"), "list"),
    (("상세", "detail", "설정", "settings", "프로필", "profile", "편집", "edit"), "detail"),
    (("메인", "main", "홈", "home", "대표", "키비주얼", "컨셉보드"), "main"),
    (("랜딩", "landing", "소개", "intro"), "landing"),
]


def archetype_for(screen: str, title: str = "") -> str:
    """화면 키·표시명에서 렌더 아키타입을 정한다."""
    if screen in SCREEN_PRESETS:
        return screen
    haystack = f"{screen} {title}".lower()
    for keywords, archetype in _ARCHETYPE_HINTS:
        if any(k in haystack for k in keywords):
            return archetype
    return "main"


def infer_target_screen(requirements: str, platform: str) -> tuple[str, str]:
    """Input Analyzer 의 대표 장면 추론 (미지정 시 호출).

    단서가 없으면 메인 컨셉 보드를 쓴다. 사이트 구조를 추론하지 않는다.
    반환: (screen key, screen title)
    """
    text = (requirements or "").lower()
    for keywords, archetype in _ARCHETYPE_HINTS:
        if any(k in text for k in keywords):
            return archetype, SCREEN_PRESETS[archetype]
    # 단서가 없으면 메인 컨셉 보드. 모바일도 사이트 목업으로 가지 않는다.
    return "main", SCREEN_PRESETS["main"]


# --- 컬러 유틸 (unified 모드의 강조색 Hue 회전에 사용) -------------------------


def _hex_to_rgb(value: str) -> tuple[float, float, float]:
    v = value.lstrip("#")
    return tuple(int(v[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def _rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c * 255))):02X}" for c in rgb)


def rotate_hue(value: str, degrees: float) -> str:
    """HEX 컬러의 Hue 만 회전한다 (채도·명도 유지)."""
    r, g, b = _hex_to_rgb(value)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    h = (h + degrees / 360.0) % 1.0
    return _rgb_to_hex(colorsys.hls_to_rgb(h, l, s))


# --- Concept Engine ----------------------------------------------------------


def placeholder_concepts(
    n: int, ds_mode: str = "per_concept", briefs: list[dict] | None = None
) -> list[dict]:
    """컨셉 N종의 DS Token 세트를 만든다.

    unified 모드는 A 컨셉의 Token 을 Base 로 삼아 전 컨셉이 공유하고,
    강조색(secondary·info)만 Hue 120도씩 회전시켜 구별성을 확보한다.
    briefs 가 있으면(컨셉 직접 입력 모드) 컨셉 이름·방향성을 사용자 값으로 덮는다.
    """
    count = max(1, min(n, len(CONCEPTS)))
    if ds_mode != DS_MODE_UNIFIED:
        return _apply_briefs([_deep_copy(c) for c in CONCEPTS[:count]], briefs)

    base = _deep_copy(CONCEPTS[0])
    out: list[dict] = []
    for i in range(count):
        concept = _deep_copy(base)
        concept["conceptLabel"] = CONCEPTS[i]["conceptLabel"]
        secondary = rotate_hue(base["tokens"]["color"]["secondary"], 120 * i)
        info = rotate_hue(base["tokens"]["color"]["info"], 120 * i)
        concept["tokens"]["color"]["secondary"] = secondary
        concept["tokens"]["color"]["info"] = info
        if i == 0:
            concept["conceptName"] = f"{base['conceptName']} (Base)"
            concept["description"] = (
                "단일 DS 통일 — Base Token 원본. Typography·Spacing 등은 전 컨셉 공통 고정이다."
            )
        else:
            concept["conceptName"] = f"{base['conceptName']} · Accent {i + 1}"
            concept["description"] = (
                "단일 DS 통일 — Base Token 공통, 강조색만 변주한 컨셉이다."
            )
        concept["dsMode"] = DS_MODE_UNIFIED
        concept["baseConceptLabel"] = CONCEPTS[0]["conceptLabel"]
        concept["overriddenFields"] = (
            {} if i == 0 else {"color": {"secondary": secondary, "info": info}}
        )
        out.append(concept)
    return _apply_briefs(out, briefs)


def _apply_briefs(concepts: list[dict], briefs: list[dict] | None) -> list[dict]:
    """컨셉 직접 입력 값을 생성 결과에 반영한다."""
    if not briefs:
        return concepts
    for concept, brief in zip(concepts, briefs):
        name = (brief.get("name") or "").strip()
        direction = (brief.get("direction") or "").strip()
        keywords = (brief.get("keywords") or "").strip()
        if name:
            concept["conceptName"] = name
        if direction:
            concept["description"] = direction
        if keywords:
            concept["keywords"] = keywords
    return concepts


# --- Layout Engine -----------------------------------------------------------


def placeholder_layouts(
    variants: int, screen: str = "main", screen_title: str = "메인"
) -> list[dict]:
    """동일 장면(screen)의 컨셉 시안 N종을 만든다."""
    archetype = archetype_for(screen, screen_title)
    labels = VARIANT_LABELS[archetype]
    count = max(1, min(variants, len(labels)))
    return [
        {
            "kind": archetype,
            "screen": screen,
            "screenTitle": screen_title,
            "title": f"{screen_title} · 변형 {i + 1}",
            "variantLabel": labels[i],
            "sections": _deep_copy(DEFAULT_SECTIONS.get(archetype, DEFAULT_SECTIONS["main"])),
            "nodeTree": None,
        }
        for i in range(count)
    ]


def _deep_copy(value):
    if isinstance(value, dict):
        return {k: _deep_copy(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_deep_copy(v) for v in value]
    return value
