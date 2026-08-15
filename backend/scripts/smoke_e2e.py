"""문서 v0.5.0 핵심 흐름 E2E 스모크 (in-process ASGI).

서버를 띄우지 않고 ASGI 앱을 직접 호출해 아래 규칙을 전수 검증한다.
  · 시안 = 동일 화면의 구조 변형 (서로 다른 화면의 집합이 아니다)
  · 단일 DS 통일 — Base Token 공통 고정 + 강조색만 변주
  · 컨셉 확정 → 비확정 컨셉 읽기 전용 → 화면 추가 생성(경량 파이프라인)
  · 등급 게이팅 (컨셉·시안 수 / 단일 DS / Token 카테고리 / Export 형식 / API Key / 팀)
  · 동시 생성 1개 제한이 프로젝트 단위가 아니라 사용자 단위인지

실행:
    cd backend
    .venv/Scripts/python.exe scripts/smoke_e2e.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# 개발 DB 를 건드리지 않도록 임시 파일 DB 로 격리한다 (설정 로드 전에 지정).
#
# 다른 DB 엔진(PostgreSQL 등)으로 같은 검증을 돌리려면 SMOKE_DATABASE_URL 을 준다.
# `DATABASE_URL` 을 그대로 읽지 않는 이유는, 개발 셸에 그 변수가 떠 있는 상태로
# 실행하면 스모크가 개발 DB 를 갈아엎기 때문이다 — 파괴적 동작은 명시적으로만 켠다.
#
#   $env:SMOKE_DATABASE_URL = "postgresql+asyncpg://user:pw@host/db"
#   .venv/Scripts/python.exe scripts/smoke_e2e.py
_EXTERNAL_DB = os.environ.get("SMOKE_DATABASE_URL", "").strip()
_TMP_DB = Path(tempfile.gettempdir()) / "adg_smoke.db"
if _EXTERNAL_DB:
    os.environ["DATABASE_URL"] = _EXTERNAL_DB
    print(f"[스모크] 외부 DB 로 실행 — {_EXTERNAL_DB.split('://', 1)[0]} (스키마를 새로 만든다)")
else:
    _TMP_DB.unlink(missing_ok=True)
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP_DB.as_posix()}"
os.environ["FAKE_AI_PIPELINE"] = "true"
os.environ["DEBUG"] = "false"
os.environ["ENVIRONMENT"] = "test"

from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402

API = "/api/v1"
FAILS: list[str] = []


def check(label: str, ok: bool, extra: str = "") -> None:
    print(("  OK   " if ok else "  FAIL ") + label + (f" — {extra}" if extra else ""))
    if not ok:
        FAILS.append(label)


async def reset_external_schema() -> None:
    """외부 DB 로 돌 때만 스키마를 비우고 다시 만든다.

    임시 SQLite 는 파일을 지우면 그만이지만 외부 DB 는 그럴 수 없다. 앞선 실행이
    남긴 행이 있으면 '최대 5개' 같은 상한 검사가 엉뚱하게 실패한다.
    """
    from app.core.database import Base, engine, init_db

    await init_db()  # 모델 import 를 태워 metadata 를 채운다
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


async def main() -> None:
    if _EXTERNAL_DB:
        await reset_external_schema()
    await seed()  # 플랜·데모 계정·관리자 계정 시드
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        # 1) 로그인 (Pro 데모 계정)
        r = await c.post(f"{API}/auth/login", json={"email": "demo@designgenerator.io", "password": "demo1234"})
        check("login", r.status_code == 200, str(r.status_code))
        token = r.json()["accessToken"]
        h = {"Authorization": f"Bearer {token}"}

        # 2) 프로젝트 생성 — 생성 화면 지정 + 단일 DS 통일 (Pro 허용)
        r = await c.post(
            f"{API}/projects",
            headers=h,
            json={
                "name": "스모크 프로젝트",
                "requirementsText": "B2B SaaS 분석 대시보드. 차분한 무드.",
                "platform": "Web",
                "conceptCount": 3,
                "variantCount": 5,
                "dsMode": "unified",
                "targetScreen": "dashboard",
            },
        )
        check("project create (unified/dashboard)", r.status_code == 201, r.text[:160])
        p = r.json()
        check("  ds_mode=unified", p["dsMode"] == "unified", p["dsMode"])
        check("  targetScreen=dashboard", p["targetScreen"] == "dashboard", p["targetScreen"])
        check("  inferred=False", p["targetScreenInferred"] is False)
        pid = p["id"]

        # 3) 생성 시작 → 완료 폴링
        r = await c.post(f"{API}/projects/{pid}/generate", headers=h, json={})
        check("generate start", r.status_code == 202, r.text[:160])
        gid = r.json()["id"]
        for _ in range(60):
            r = await c.get(f"{API}/generations/{gid}/status", headers=h)
            if r.json()["status"] in ("Done", "Failed"):
                break
            await asyncio.sleep(0.1)
        gen = r.json()
        check("generate done", gen["status"] == "Done", str(gen)[:200])

        # 4) 시안 = 동일 화면의 구조 변형인지 검증
        r = await c.get(f"{API}/projects/{pid}/mockups", headers=h)
        mocks = r.json()
        check("mockups 3컨셉 x 5변형 = 15", len(mocks) == 15, str(len(mocks)))
        screens = {m["screen"] for m in mocks}
        kinds = {m["kind"] for m in mocks}
        check("  단일 화면 축", screens == {"dashboard"}, str(screens))
        check("  단일 아키타입", kinds == {"dashboard"}, str(kinds))
        labels = {m["variantLabel"] for m in mocks if m["conceptLabel"] == "A"}
        check("  변형 라벨 5종 상이", len(labels) == 5, str(labels))

        # 5) unified DS — Base 공통 + 강조색만 변주
        r = await c.get(f"{API}/projects/{pid}/design-systems", headers=h)
        ds = r.json()
        check("design systems 3", len(ds) == 3, str(len(ds)))
        base_typo = {json.dumps(d["tokens"]["typography"], sort_keys=True) for d in ds}
        check("  Base Typography 공통 고정", len(base_typo) == 1)
        secondaries = {d["tokens"]["color"]["secondary"] for d in ds}
        check("  강조색 3종 상이", len(secondaries) == 3, str(secondaries))
        check("  base_ds_id 연결", sum(1 for d in ds if d["baseDsId"]) == 2)

        # 6) Free 게이팅 — Typography 수정 차단은 Pro 라 통과해야 함
        r = await c.patch(
            f"{API}/projects/{pid}/design-systems/A",
            headers=h,
            json={"tokens": {"color": {"primary": "#FF5722"}}},
        )
        check("token patch (color)", r.status_code == 200, r.text[:160])
        check("  반영됨", r.json()["tokens"]["color"]["primary"] == "#FF5722")

        # 7) 컨셉 확정
        r = await c.post(f"{API}/projects/{pid}/confirm-concept", headers=h, json={"conceptLabel": "B"})
        check("confirm concept", r.status_code == 200, r.text[:160])
        check("  status=ConceptLocked", r.json()["status"] == "ConceptLocked")
        r = await c.get(f"{API}/projects/{pid}/design-systems", headers=h)
        archived = [d["conceptLabel"] for d in r.json() if d["isArchived"]]
        check("  비확정 컨셉 읽기 전용", sorted(archived) == ["A", "C"], str(archived))
        r = await c.patch(f"{API}/projects/{pid}/design-systems/A", headers=h, json={"tokens": {"color": {"primary": "#000000"}}})
        check("  archived 컨셉 수정 차단(409)", r.status_code == 409, str(r.status_code))

        # 8) 화면 추가 생성 (경량 파이프라인)
        r = await c.post(f"{API}/projects/{pid}/screens", headers=h, json={"screen": "login", "description": "로그인 화면"})
        check("screen add", r.status_code == 202, r.text[:160])
        sgid = r.json()["id"]
        check("  kind=screen_add", r.json()["kind"] == "screen_add")
        for _ in range(60):
            r = await c.get(f"{API}/generations/{sgid}/status", headers=h)
            if r.json()["status"] in ("Done", "Failed"):
                break
            await asyncio.sleep(0.1)
        check("screen add done", r.json()["status"] == "Done", str(r.json())[:200])

        r = await c.get(f"{API}/projects/{pid}/screens", headers=h)
        screens = r.json()
        check("screens 2개", len(screens) == 2, str(screens))
        login = next((s for s in screens if s["screen"] == "login"), None)
        check("  login 변형 3종 고정", login and login["variantCount"] == 3, str(login))
        r = await c.get(f"{API}/projects/{pid}/mockups?screen=login", headers=h)
        check("  확정 컨셉으로만 생성", {m["conceptLabel"] for m in r.json()} == {"B"}, str({m["conceptLabel"] for m in r.json()}))

        # 9) 화면 추가는 확정 상태에서만
        await c.post(f"{API}/projects/{pid}/unlock-concept", headers=h)
        r = await c.post(f"{API}/projects/{pid}/screens", headers=h, json={"screen": "detail"})
        check("확정 해제 후 화면 추가 차단(409)", r.status_code == 409, str(r.status_code))
        await c.post(f"{API}/projects/{pid}/confirm-concept", headers=h, json={"conceptLabel": "B"})

        # 10) Export — json/css 실산출 + 이력
        r = await c.post(f"{API}/projects/{pid}/exports", headers=h, json={"format": "json", "scope": "concept"})
        check("export json", r.status_code == 201, r.text[:200])
        exp = r.json()
        r = await c.get(exp["downloadUrl"], headers=h)
        check("  download", r.status_code == 200 and "$value" in r.text, str(r.status_code))
        r = await c.post(f"{API}/projects/{pid}/exports", headers=h, json={"format": "css", "scope": "concept"})
        r = await c.get(r.json()["downloadUrl"], headers=h)
        check("export css", r.status_code == 200 and "--ds-color-primary" in r.text, r.text[:120])
        r = await c.get(f"{API}/exports", headers=h)
        check("export 이력", len(r.json()) >= 2, str(len(r.json())))
        r = await c.get(f"{API}/projects/{pid}/tokens.json", headers=h)
        check("DTCG tokens", r.status_code == 200 and "$schema" in r.text)

        # 10-b) 사용량 집계 — 화면이 아니라 서버가 합산한다.
        r = await c.get(f"{API}/users/usage?granularity=day&periods=14", headers=h)
        usage = r.json() if r.status_code == 200 else {}
        check("사용량 집계", r.status_code == 200 and len(usage.get("buckets", [])) == 14, r.text[:160])
        check("  생성 횟수 집계", usage.get("totalGenerations", 0) >= 1, str(usage.get("totalGenerations")))
        check(
            "  Export 형식 분포",
            {f["format"] for f in usage.get("exportFormats", [])} >= {"json"},
            json.dumps(usage.get("exportFormats"), ensure_ascii=False),
        )
        check("  전월 대비 기준", "thisMonth" in usage and "lastMonth" in usage, str(list(usage)[:6]))
        r = await c.get(f"{API}/users/usage?granularity=month&periods=6", headers=h)
        check("  월별 집계", r.status_code == 200 and len(r.json()["buckets"]) == 6, str(r.status_code))
        r = await c.get(f"{API}/users/usage?granularity=bogus", headers=h)
        check("  잘못된 단위 거부(422)", r.status_code == 422, str(r.status_code))

        # 11) API Key (Pro+) → Public API (MCP Tool 대응 표면)
        r = await c.post(f"{API}/users/api-keys", headers=h, json={"label": "MCP local"})
        check("api key 발급", r.status_code == 201 and r.json()["key"].startswith("adg_"), r.text[:160])
        kid = r.json()["id"]
        raw_key = r.json()["key"]
        kh = {"X-API-Key": raw_key}

        # 인증 경계 — 키가 없거나 위조면 전부 같은 401 로 답한다.
        r = await c.get(f"{API}/public/projects")
        check("public: 키 없음 401", r.status_code == 401, str(r.status_code))
        r = await c.get(f"{API}/public/projects", headers={"X-API-Key": "adg_deadbeef.fake"})
        check("public: 위조 키 401", r.status_code == 401, str(r.status_code))
        # 웹 세션 토큰으로는 못 들어온다 — 두 인증 표면을 분리해 둔다.
        r = await c.get(f"{API}/public/projects", headers=h)
        check("public: JWT 로는 접근 불가 401", r.status_code == 401, str(r.status_code))

        r = await c.get(f"{API}/public/projects", headers=kh)
        check("public: list_projects", r.status_code == 200 and any(p["id"] == pid for p in r.json()["projects"]), r.text[:160])

        r = await c.get(f"{API}/public/projects/{pid}/tokens", headers=kh)
        check("public: get_design_tokens(DTCG)", r.status_code == 200 and '"$type"' in r.text, r.text[:160])
        check("  확정 컨셉 기본 적용", r.status_code == 200 and r.json()["concept"]["label"] == "B", r.text[:120])

        r = await c.get(f"{API}/public/projects/{pid}/mockups", headers=kh)
        pub_screens = r.json().get("screens", []) if r.status_code == 200 else []
        check("public: get_mockup_context", r.status_code == 200 and len(pub_screens) >= 1, r.text[:160])
        # 시안 = 같은 화면의 구조 변형이라는 규칙이 응답 구조에도 드러나야 한다.
        check(
            "  화면축 ⊥ 변형축 분리",
            all(s.get("screen") and len(s.get("variants", [])) >= 1 for s in pub_screens),
            json.dumps(pub_screens[:1], ensure_ascii=False)[:160],
        )

        r = await c.get(f"{API}/public/projects/{pid}/components", headers=kh)
        check(
            "public: get_component_styles",
            r.status_code == 200
            and set(r.json()["components"]) == {"button", "input", "card", "typography"},
            r.text[:160],
        )

        # 소유권 격리 — 남의(또는 없는) 프로젝트는 404 로 존재조차 흘리지 않는다.
        r = await c.get(f"{API}/public/projects/not-a-real-project/tokens", headers=kh)
        check("public: 타 프로젝트 404", r.status_code == 404, str(r.status_code))

        # 읽기 전용 — 유출된 키로 자원이 바뀌면 안 된다.
        r = await c.post(f"{API}/public/projects", headers=kh, json={"name": "x"})
        check("public: 쓰기 메서드 없음(405)", r.status_code == 405, str(r.status_code))

        r = await c.delete(f"{API}/users/api-keys/{kid}", headers=h)
        check("api key 회수", r.status_code == 200)
        r = await c.get(f"{API}/public/projects", headers=kh)
        check("public: 회수된 키 401", r.status_code == 401, str(r.status_code))

        # 11-b) 세션 — 현재 기기 표시와 다른 기기 전체 종료
        r = await c.get(f"{API}/users/sessions", headers=h)
        sess = r.json()
        check("세션 목록", r.status_code == 200 and len(sess) >= 1, str(r.status_code))
        check("  현재 기기 표시", sum(1 for s2 in sess if s2["current"]) == 1,
              str([(s2["device"], s2["current"]) for s2 in sess]))
        # 다른 기기에서 한 번 더 로그인한 뒤 전체 종료
        r2 = await c.post(f"{API}/auth/login", headers={"User-Agent": "OtherDevice/1.0"},
                          json={"email": "demo@designgenerator.io", "password": "demo1234"})
        check("  다른 기기 로그인", r2.status_code == 200, str(r2.status_code))
        r = await c.get(f"{API}/users/sessions", headers=h)
        check("  세션 2개 이상", len(r.json()) >= 2, str(len(r.json())))
        r = await c.post(f"{API}/users/sessions/logout-all", headers=h)
        check("  다른 기기 전체 종료", r.status_code == 200, r.text[:120])
        r = await c.get(f"{API}/users/sessions", headers=h)
        check("  현재 기기만 남음", len(r.json()) == 1, str(len(r.json())))

        # 12) 템플릿 등록 → 심사
        r = await c.post(
            f"{API}/templates",
            headers=h,
            json={"name": "스모크 DS", "category": "SaaS Dashboard", "description": "테스트", "price": 10, "projectId": pid},
        )
        check("템플릿 등록(Pending)", r.status_code == 201 and r.json()["status"] == "Pending", r.text[:160])
        tid = r.json()["id"]
        r = await c.get(f"{API}/templates", headers=h)
        check("  심사 전 마켓 미노출", all(t["id"] != tid for t in r.json()))
        r = await c.post(f"{API}/auth/login", json={"email": "admin@designgenerator.io", "password": "admin1234"})
        ah = {"Authorization": f"Bearer {r.json()['accessToken']}"}
        r = await c.patch(f"{API}/admin/templates/{tid}", headers=ah, json={"status": "Approved"})
        check("  Admin 승인", r.status_code == 200 and r.json()["status"] == "Approved", r.text[:160])
        r = await c.get(f"{API}/templates", headers=h)
        check("  승인 후 노출", any(t["id"] == tid for t in r.json()))

        # 12-b) 리뷰 — 목록·평점 분포
        r = await c.get(f"{API}/templates/{tid}/reviews")
        check("리뷰 목록 (빈 상태)", r.status_code == 200 and r.json()["total"] == 0, r.text[:120])
        r = await c.post(f"{API}/templates/{tid}/reviews", headers=h,
                         json={"rating": 5, "comment": "초기 시안 시간이 줄었다."})
        check("  리뷰 등록", r.status_code == 201, r.text[:120])
        r = await c.post(f"{API}/templates/{tid}/reviews", headers=ah,
                         json={"rating": 3, "comment": "무난하다."})
        check("  두 번째 리뷰", r.status_code == 201, r.text[:120])
        r = await c.get(f"{API}/templates/{tid}/reviews")
        rv = r.json()
        check("  평균 계산", rv["average"] == 4.0, str(rv["average"]))
        check("  평점 분포", rv["distribution"]["5"] == 1 and rv["distribution"]["3"] == 1,
              json.dumps(rv["distribution"]))
        check("  작성자 이름 채움", all(x["authorName"] != "알 수 없음" for x in rv["reviews"]),
              str([x["authorName"] for x in rv["reviews"]]))

        # 12-b) 비밀번호 정책 (약한 값 거부)
        r = await c.post(f"{API}/auth/signup", json={"email": "weak.smoke@test.io", "password": "12345678", "name": "약한"})
        check("약한 비밀번호 거부(400)", r.status_code == 400, f"{r.status_code} {r.text[:60]}")
        r = await c.post(f"{API}/auth/signup", json={"email": "weak2.smoke@test.io", "password": "password", "name": "약한"})
        check("흔한 비밀번호 거부(400)", r.status_code == 400, str(r.status_code))

        # 13) Free 등급 게이팅
        r = await c.post(f"{API}/auth/signup", json={"email": "free.smoke@test.io", "password": "Free-adg-2026", "name": "프리"})
        if r.status_code != 201:
            r = await c.post(f"{API}/auth/login", json={"email": "free.smoke@test.io", "password": "Free-adg-2026"})
        fh = {"Authorization": f"Bearer {r.json()['accessToken']}"}
        r = await c.post(
            f"{API}/projects",
            headers=fh,
            json={"name": "프리 프로젝트", "requirementsText": "간단한 랜딩", "conceptCount": 3, "variantCount": 5, "dsMode": "unified"},
        )
        check("Free 단일DS통일 차단(403)", r.status_code == 403, str(r.status_code))
        r = await c.post(f"{API}/projects", headers=fh, json={"name": "프리 프로젝트", "requirementsText": "간단한 랜딩 페이지", "conceptCount": 3, "variantCount": 5})
        fp = r.json()
        check("Free 컨셉 1종 강제", fp["conceptCount"] == 1, str(fp["conceptCount"]))
        check("Free 시안 3종 강제", fp["variantCount"] == 3, str(fp["variantCount"]))
        r = await c.post(f"{API}/projects/{fp['id']}/generate", headers=fh, json={})
        check("Free 생성 시작", r.status_code == 202, r.text[:160])
        fgid = r.json()["id"]
        for _ in range(60):
            r = await c.get(f"{API}/generations/{fgid}/status", headers=fh)
            if r.json()["status"] in ("Done", "Failed"):
                break
            await asyncio.sleep(0.1)
        check("Free 생성 완료", r.json()["status"] == "Done", str(r.json())[:160])
        r = await c.get(f"{API}/projects/{fp['id']}", headers=fh)
        check("  AI 화면 추론 표기", r.json()["targetScreenInferred"] is True and r.json()["targetScreen"] != "")
        r = await c.patch(f"{API}/projects/{fp['id']}/design-systems/A", headers=fh, json={"tokens": {"typography": {"baseSize": 20}}})
        check("Free Typography 수정 차단(403)", r.status_code == 403, str(r.status_code))
        r = await c.patch(f"{API}/projects/{fp['id']}/design-systems/A", headers=fh, json={"tokens": {"color": {"primary": "#FF5722"}}})
        check("Free Color 수정 허용", r.status_code == 200, str(r.status_code))
        r = await c.post(f"{API}/projects/{fp['id']}/exports", headers=fh, json={"format": "json", "scope": "concept"})
        check("Free .json Export 차단(403)", r.status_code == 403, str(r.status_code))
        r = await c.post(f"{API}/projects/{fp['id']}/exports", headers=fh, json={"format": "png", "scope": "current", "resolution": "2x"})
        check("Free .png Export 허용 + 워터마크", r.status_code == 201 and r.json()["watermark"] is True, r.text[:160])
        r = await c.get(f"{API}/users/api-keys", headers=fh)
        check("Free API Key 차단(403)", r.status_code == 403, str(r.status_code))
        r = await c.post(f"{API}/teams", headers=fh, json={"name": "프리팀"})
        check("Free 팀 생성 차단(403)", r.status_code == 403, str(r.status_code))

        # 14) 동시 생성 1개 제한 — 사용자 단위 검사인지 확인한다.
        #     in-process ASGI 는 background task 가 응답 전에 끝나므로,
        #     진행 중(Running) 생성 행을 직접 넣어 규칙 자체를 검증한다.
        from app.core.database import AsyncSessionLocal
        from app.models.generation import Generation
        from app.models.user import User
        from sqlalchemy import select as _select

        r1 = await c.post(f"{API}/projects", headers=h, json={"name": "동시성 A", "requirementsText": "테스트 랜딩"})
        r2 = await c.post(f"{API}/projects", headers=h, json={"name": "동시성 B", "requirementsText": "테스트 랜딩"})
        a, b = r1.json()["id"], r2.json()["id"]

        async with AsyncSessionLocal() as db:
            demo = await db.scalar(_select(User).where(User.email == "demo@designgenerator.io"))
            stub = Generation(project_id=a, user_id=demo.id, status="Running", stage="ConceptEngine", progress=40)
            db.add(stub)
            await db.commit()
            stub_id = stub.id

        # 같은 사용자의 '다른 프로젝트' 생성도 막혀야 사용자 단위 검사다.
        rb = await c.post(f"{API}/projects/{b}/generate", headers=h, json={})
        check("동시 생성 차단 — 사용자 단위(409)", rb.status_code == 409, f"{rb.status_code} {rb.text[:80]}")
        # 다른 사용자는 영향을 받지 않아야 한다.
        rf = await c.post(f"{API}/projects", headers=fh, json={"name": "다른 사용자", "requirementsText": "테스트 랜딩"})
        rf2 = await c.post(f"{API}/projects/{rf.json()['id']}/generate", headers=fh, json={})
        check("  다른 사용자는 영향 없음", rf2.status_code in (202, 402), str(rf2.status_code))

        async with AsyncSessionLocal() as db:
            row = await db.get(Generation, stub_id)
            await db.delete(row)
            await db.commit()

        # 15) 팀 (Team 등급 필요 — Admin 계정으로)
        r = await c.post(f"{API}/teams", headers=ah, json={"name": "디자인팀"})
        check("팀 생성", r.status_code in (201, 409), r.text[:160])
        if r.status_code == 201:
            tmid = r.json()["id"]
            r = await c.post(f"{API}/teams/{tmid}/members", headers=ah, json={"email": "demo@designgenerator.io", "role": "Member"})
            check("팀원 초대", r.status_code == 201, r.text[:160])

    print("\n" + ("전부 통과" if not FAILS else f"실패 {len(FAILS)}건: {FAILS}"))


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(1 if FAILS else 0)
