"""공개 시스템 엔드포인트: 헬스 체크, 활성 공지, 피드백 제출."""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter
from sqlalchemy import or_, select

from app.core.deps import CurrentUser, DbDep
from app.models.admin import Announcement, Feedback
from app.schemas.admin import AnnouncementOut
from app.schemas.common import CamelModel, Message

router = APIRouter(tags=["system"])


class HealthOut(CamelModel):
    status: str


class FeedbackIn(CamelModel):
    category: str = "feedback"  # bug | feature | feedback
    title: str
    body: str = ""


@router.get("/health", response_model=HealthOut)
async def health():
    """의존성 상태를 공개하지 않는다 (운영심화 §7 정찰면 축소)."""
    return HealthOut(status="ok")


@router.api_route("/__crawl-trap", methods=["GET", "POST", "HEAD"], include_in_schema=False)
async def crawl_trap():
    """미들웨어가 먼저 차단한다. 라우트는 경로 정합용 자리만."""
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=404, content={"detail": "Not Found"})


@router.get("/announcements", response_model=list[AnnouncementOut])
async def active_announcements(db: DbDep):
    """지금 노출해야 할 공지만 돌려준다 (기능정의서 v0.2.0 §6 '공지사항 노출').

    게시 상태만 보고 내보내면 **예약 공지가 미리 뜨고 종료된 공지가 계속 남는다.**
    관리자가 기간을 지정한 이상 그 기간이 곧 노출 조건이므로 여기서 거른다.
    기간을 비워 둔 공지는 상시 노출로 본다.
    """
    now = dt.datetime.now(dt.timezone.utc)
    rows = (
        await db.scalars(
            select(Announcement)
            .where(
                Announcement.status == "Published",
                or_(Announcement.starts_at.is_(None), Announcement.starts_at <= now),
                or_(Announcement.ends_at.is_(None), Announcement.ends_at >= now),
            )
            .order_by(Announcement.starts_at.desc())
        )
    ).all()
    return [AnnouncementOut.model_validate(a) for a in rows]


@router.post("/feedback", response_model=Message, status_code=201)
async def submit_feedback(body: FeedbackIn, user: CurrentUser, db: DbDep):
    db.add(
        Feedback(
            user_email=user.email,
            category=body.category,
            title=body.title,
            body=body.body,
            status="new",
        )
    )
    return Message(detail="Feedback submitted")
