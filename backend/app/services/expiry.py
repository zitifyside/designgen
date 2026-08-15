"""만료 임박 Export 안내 (기능정의서 v0.2.0 §3.1 'Export 실행·이력 — 자동 만료').

주기 잡을 두지 않고 **사용자가 알림을 확인하는 시점에** 훑는다. 컨테이너가 요청이
없으면 잠드는 환경(Cloud Run)에서 백그라운드 루프는 돌기도 하고 안 돌기도 해서,
'그때 돌았으면 좋았을' 알림이 조용히 빠진다. 인앱 알림은 어차피 앱을 열어야 보이므로,
열었을 때 최신 상태로 만들어 주는 편이 결과가 같고 더 단순하다.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.platform import ExportHistory
from app.services.purge import purge_due_accounts

# 만료 몇 시간 전부터 알릴지.
WARN_WITHIN_HOURS = 24


async def notify_expiring_exports(db: AsyncSession, user_id: str) -> int:
    """만료가 임박한 Export 에 대해 아직 보내지 않은 안내를 만든다."""
    await purge_due_accounts(db)
    now = dt.datetime.now(dt.timezone.utc)
    deadline = now + dt.timedelta(hours=WARN_WITHIN_HOURS)

    rows = (
        await db.scalars(
            select(ExportHistory).where(
                ExportHistory.user_id == user_id,
                ExportHistory.expiry_notified.is_(False),
                ExportHistory.expires_at <= deadline,
                ExportHistory.expires_at > now,
            )
        )
    ).all()

    for row in rows:
        # SQLite 는 `DateTime(timezone=True)` 여도 시간대 없는 값을 돌려준다.
        # SQL 비교는 통과하지만 파이썬 뺄셈에서 터지므로 여기서 맞춰 준다.
        expires = row.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=dt.timezone.utc)
        hours = max(1, int((expires - now).total_seconds() // 3600))
        db.add(
            Notification(
                user_id=user_id,
                category="system",
                title="Export 파일 만료 예정",
                body=(
                    f"'{row.project_name}' 의 .{row.format} 파일이 약 {hours}시간 뒤 "
                    "만료된다. 필요하면 다시 내려받아 두라."
                ),
                href=f"/projects/{row.project_id}/export",
            )
        )
        row.expiry_notified = True
        db.add(row)

    # 세션이 autoflush=False 라, 여기서 밀어 넣지 않으면 **같은 요청의 목록 조회에
    # 방금 만든 알림이 안 잡힌다** (다음 번에야 보인다).
    if rows:
        await db.flush()

    return len(rows)
