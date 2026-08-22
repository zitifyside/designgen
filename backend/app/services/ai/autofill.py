"""프로젝트명만으로 생성 폼을 채운다 — **개발 편의용 한시 기능**.

⚠ 이 모듈은 임시다. 시안 품질을 손보는 동안 매번 프롬프트·플랫폼·컨셉
방향성을 손으로 적는 게 번거로워 만든 것이고, 제품 기능으로 설계한 것이
아니다. 끌 때는 `ENABLE_DEV_AUTOFILL=false` 로 막고, 걷어낼 때는 이 파일과
`routes/projects.py` 의 autofill 라우트, 프론트의 자동 입력 버튼을 함께
지우면 된다. 파이프라인 4단계에는 손대지 않았으므로 제거해도 생성은 그대로다.

모델은 **Gemini 3.7 Flash** 를 1순위로 쓴다. 릴레이 사다리의 첫 채널인
Antigravity 가 그 모델(`gemini-3.7-flash-medium`)이라, 사다리를 그대로 타면
1순위가 자연히 그것이 된다. Antigravity 가 막히면 codex·claude 로 내려간다 —
자동 입력이 안 되는 것보다 다른 모델이 채워 주는 편이 낫다.
"""
from __future__ import annotations

from typing import Any

from app.services.ai.pipeline import get_provider

PLATFORMS = ["Web", "Mobile"]
SCREENS = ["", "main", "landing", "login", "dashboard", "list", "detail"]

PROMPT_AUTOFILL = (
    "당신은 디자인 시안 브리프 작성자다. 프로젝트 이름 하나만 보고, 그 이름이 "
    "가리킬 법한 서비스를 상상해 시안 생성 폼을 채운다. 개발자가 시안을 빨리 "
    "뽑아 보려고 쓰는 자동 입력이므로, 되묻지 말고 그럴듯하게 확정해서 채워라.\n"
    "\n"
    "· requirements — 사용자가 직접 적었을 법한 한국어 프롬프트 한 덩이(200~400자). "
    "업종·타깃·무드·색 방향·강조하고 싶은 것을 자연스러운 문장으로 적는다. "
    "번호 매기기나 마크다운은 쓰지 말고 줄바꿈 한두 번까지만 허용한다.\n"
    "· platform — Web 또는 Mobile. 이름이 앱을 가리키면 Mobile, 아니면 Web.\n"
    "· targetScreen — 대표 장면. 확신이 없으면 빈 문자열로 두어 AI 가 고르게 한다.\n"
    "· concepts — 서로 뚜렷이 다른 컨셉 방향 3개. name 은 한국어 짧은 이름, "
    "direction 은 한 문장, keywords 는 쉼표로 구분한 3~5개. "
    "'모던 미니멀'·'심플 클린' 같은 무색무취한 이름은 쓰지 마라.\n"
    "\n"
    "이름이 영문 약어나 조어여도 추론해서 채우고 빈 값을 돌려주지 마라."
)

AUTOFILL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "requirements": {"type": "string", "description": "한국어 프롬프트 200~400자."},
        "platform": {"type": "string", "enum": PLATFORMS},
        "targetScreen": {"type": "string", "enum": SCREENS},
        "concepts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "한국어 컨셉 이름."},
                    "direction": {"type": "string", "description": "방향성 한 문장."},
                    "keywords": {"type": "string", "description": "쉼표로 구분한 키워드 3~5개."},
                },
                "required": ["name", "direction", "keywords"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["requirements", "platform", "targetScreen", "concepts"],
    "additionalProperties": False,
}


def _clip(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit].strip()


def normalize(result: dict[str, Any]) -> dict[str, Any]:
    """모델 출력을 폼이 그대로 쓸 수 있는 값으로 좁힌다.

    enum 을 벗어난 값은 거절하지 않고 안전한 기본값으로 접는다 — 자동 입력은
    편의 기능이라, 한 칸이 어긋났다고 전체를 실패시키면 손으로 적는 것보다
    번거로워진다.
    """
    platform = str(result.get("platform") or "").strip()
    screen = str(result.get("targetScreen") or "").strip()
    concepts: list[dict[str, str]] = []
    for item in (result.get("concepts") or [])[:3]:
        if not isinstance(item, dict):
            continue
        name = _clip(item.get("name"), 40)
        if not name:
            continue
        concepts.append(
            {
                "name": name,
                "direction": _clip(item.get("direction"), 200),
                "keywords": _clip(item.get("keywords"), 120),
            }
        )
    return {
        # 프롬프트는 줄바꿈을 살린다 — _clip 은 공백을 뭉개므로 여기만 따로 다룬다.
        "requirements": str(result.get("requirements") or "").strip()[:10000],
        "platform": platform if platform in PLATFORMS else "Web",
        "targetScreen": screen if screen in SCREENS else "",
        "concepts": concepts,
    }


async def suggest(name: str) -> dict[str, Any]:
    """프로젝트명으로 폼 값을 만든다."""
    provider = get_provider()
    completer = getattr(provider, "complete_json", None)
    if completer is None:
        # 릴레이·마에 사다리가 아닌 provider 는 이 일회성 호출을 모른다.
        # 자동 입력은 개발 편의 기능이므로 조용히 포기하고 알려 준다.
        raise RuntimeError("현재 AI provider 는 자동 입력을 지원하지 않습니다.")
    result = await completer(PROMPT_AUTOFILL, {"projectName": name}, AUTOFILL_SCHEMA)
    return normalize(result)
