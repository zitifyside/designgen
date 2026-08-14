"""프론트 API 클라이언트 경로 ↔ 백엔드 라우트 대조 게이트.

`frontend/src/lib/api.ts` 가 호출하는 경로를 뽑아 FastAPI 라우트 목록과 맞춰본다.
타입 체크로는 잡히지 않는 경로 드리프트(예: `/billing/plans` vs `/plans`)를
빌드 전에 잡기 위한 검사다.

실행:
    cd backend
    .venv/Scripts/python.exe scripts/check_api_paths.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

API_TS = ROOT.parent / "frontend" / "src" / "lib" / "api.ts"
PREFIX = "/api/v1"

# request("/path") · request(`/path/${x}`) 의 첫 인자를 뽑는다.
# 제네릭 안에 중첩 `>` 가 있을 수 있어(`Record<string, unknown>`) `(` 직전까지 훑는다.
CALL_RE = re.compile(r"request(?:<[^(]*>)?\(\s*([\"`])([^\"`]+)\1")
TEMPLATE_RE = re.compile(r"\$\{[^}]+\}")


def normalize(path: str) -> str:
    """템플릿 자리표시자를 FastAPI 경로 파라미터 형태로 바꾼다."""
    return TEMPLATE_RE.sub("{}", path)


def backend_paths() -> set[str]:
    from app.main import app

    out: set[str] = set()
    for route in app.routes:
        if not hasattr(route, "methods"):
            continue
        path = route.path
        if not path.startswith(PREFIX):
            continue
        out.add(re.sub(r"\{[^}]+\}", "{}", path[len(PREFIX) :]))
    return out


def frontend_paths() -> set[str]:
    source = API_TS.read_text(encoding="utf-8")
    found = {normalize(m.group(2)) for m in CALL_RE.finditer(source)}
    # downloadFile 은 서버가 내려준 URL 을 그대로 받으므로 대조 대상이 아니다.
    return {p for p in found if p.startswith("/")}


def main() -> int:
    backend = backend_paths()
    frontend = frontend_paths()
    missing = sorted(p for p in frontend if p not in backend)

    print(f"백엔드 라우트 {len(backend)}개 · 프론트 호출 경로 {len(frontend)}개")
    if missing:
        print("\n백엔드에 없는 프론트 호출 경로:")
        for p in missing:
            print(f"  ✗ {PREFIX}{p}")
        return 1

    unused = sorted(p for p in backend if p not in frontend)
    if unused:
        print(f"\n프론트가 아직 쓰지 않는 백엔드 경로 {len(unused)}개 (참고):")
        for p in unused:
            print(f"  · {PREFIX}{p}")
    print("\n경로 정합 OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
