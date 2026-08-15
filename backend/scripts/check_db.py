"""DB 연결 사전 점검 — 전환 전에 여기서 막힌다.

운영 DB 를 바꾸는 날 가장 많이 새는 곳은 코드가 아니라 **연결 조건**이다. 주소가
닿는지, 인증이 통과하는지, TLS 가 맞는지, 지연이 감당 가능한지, 스키마를 만들 권한이
있는지를 따로따로 확인해야 어디서 막혔는지 알 수 있다. 한 번에 "연결 실패" 만 보면
원인을 좁히는 데 시간이 다 간다.

실행:
    cd backend
    .venv/Scripts/python.exe scripts/check_db.py "postgresql://user:pw@host:5432/adg?sslmode=require"

비밀번호는 인자로 넘기면 셸 기록에 남는다. 환경변수를 권장한다.
    $env:CHECK_DATABASE_URL = "postgresql://..."
    .venv/Scripts/python.exe scripts/check_db.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def mask(url: str) -> str:
    """로그에 남겨도 되는 형태로 자격증명을 지운다."""
    if "@" not in url:
        return url
    scheme, rest = url.split("://", 1)
    creds, host = rest.split("@", 1)
    user = creds.split(":", 1)[0]
    return f"{scheme}://{user}:***@{host}"


async def main() -> int:
    raw = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.environ.get("CHECK_DATABASE_URL", "").strip()
    )
    if not raw:
        print("연결 문자열이 없습니다. 인자 또는 CHECK_DATABASE_URL 로 넘기세요.")
        return 2

    # 설정 로드 전에 지정해야 엔진이 이 값을 쓴다.
    os.environ["DATABASE_URL"] = raw

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.database import normalize_database_url

    url, connect_args = normalize_database_url(raw)
    ssl_desc = connect_args.get("ssl")
    print(f"대상    : {mask(url)}")
    print(f"드라이버: {url.split('://', 1)[0]}")
    print(f"TLS     : {ssl_desc if isinstance(ssl_desc, str) else ('사설 CA 검증' if ssl_desc else '미설정')}")
    print("-" * 60)

    engine = create_async_engine(url, connect_args=connect_args, pool_pre_ping=True)
    failures = 0

    def ok(label: str, detail: str = "") -> None:
        print(f"  OK   {label}" + (f" — {detail}" if detail else ""))

    def bad(label: str, err: Exception) -> None:
        nonlocal failures
        failures += 1
        print(f"  FAIL {label} — {type(err).__name__}: {err}")

    # 1) 연결·인증·TLS
    try:
        started = time.perf_counter()
        async with engine.connect() as conn:
            elapsed = (time.perf_counter() - started) * 1000
            ok("연결·인증", f"{elapsed:.0f}ms")

            # 2) 서버 정보
            version = (await conn.execute(text("SELECT version()"))).scalar_one()
            ok("서버", version.split(",")[0])

            # 3) 왕복 지연 — Cloud Run 에서 원격 DB 를 쓰면 이 값이 응답 시간을 좌우한다.
            samples = []
            for _ in range(5):
                t0 = time.perf_counter()
                await conn.execute(text("SELECT 1"))
                samples.append((time.perf_counter() - t0) * 1000)
            avg = sum(samples) / len(samples)
            ok("왕복 지연", f"평균 {avg:.1f}ms (최대 {max(samples):.1f}ms)")
            if avg > 50:
                print(
                    "       ⚠ 50ms 를 넘습니다. 요청 하나에 쿼리가 여러 번 나가면"
                    " 체감 지연이 그만큼 배로 늘어납니다."
                )

            # 4) 인코딩·시간대 — 한글 저장과 시각 계산이 여기서 갈린다.
            enc = (await conn.execute(text("SHOW server_encoding"))).scalar_one()
            ok("서버 인코딩", enc)
            if enc.upper() not in ("UTF8", "UTF-8"):
                print("       ⚠ UTF8 이 아니면 한글이 깨집니다.")
            tz = (await conn.execute(text("SHOW timezone"))).scalar_one()
            ok("서버 시간대", tz)

            # 5) 권한 — 테이블을 만들 수 있어야 첫 기동이 스키마를 세운다.
            try:
                await conn.execute(text("CREATE TEMP TABLE _adg_probe (id int)"))
                await conn.execute(text("DROP TABLE _adg_probe"))
                ok("임시 테이블 생성 권한")
            except Exception as e:  # noqa: BLE001
                bad("임시 테이블 생성 권한", e)

            db_name = (await conn.execute(text("SELECT current_database()"))).scalar_one()
            has_create = (
                await conn.execute(
                    text("SELECT has_database_privilege(current_user, :db, 'CREATE')"),
                    {"db": db_name},
                )
            ).scalar_one()
            if has_create:
                ok("스키마 생성 권한", db_name)
            else:
                failures += 1
                print(f"  FAIL 스키마 생성 권한 — {db_name} 에 CREATE 권한이 없습니다.")

            # 6) 기존 데이터 — 빈 DB 인지 이미 쓰던 DB 인지 알려 준다.
            count = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM information_schema.tables "
                        "WHERE table_schema = 'public'"
                    )
                )
            ).scalar_one()
            ok("public 스키마 테이블", f"{count}개" + (" (빈 DB)" if count == 0 else ""))
    except Exception as e:  # noqa: BLE001
        bad("연결", e)
        print()
        print("자주 걸리는 원인:")
        print("  · 주소·포트가 밖에서 닿지 않는다 (방화벽·공유기 포워딩·터널 미기동)")
        print("  · pg_hba.conf 가 이 접속 IP 를 허용하지 않는다")
        print("  · postgresql.conf 의 listen_addresses 가 localhost 로 묶여 있다")
        print("  · 자체 서명 인증서인데 sslmode=verify-full 로 접속했다")
        print("    → 검증까지 원하면 sslrootcert 로 CA 를 지정한다")

    await engine.dispose()
    print("-" * 60)
    print("전환 가능" if failures == 0 else f"확인 필요 {failures}건")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
