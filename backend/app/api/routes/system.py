"""공개 시스템 엔드포인트: 헬스 체크, 활성 공지, 피드백 제출."""
from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select, text

from app.core.config import settings
from app.core.deps import CurrentUser, DbDep
from app.models.admin import Announcement, Feedback
from app.schemas.admin import AnnouncementOut
from app.schemas.common import CamelModel, Message

router = APIRouter(tags=["system"])


class HealthOut(CamelModel):
    status: str
    environment: str
    database: str
    fake_ai_pipeline: bool


class FeedbackIn(CamelModel):
    category: str = "feedback"  # bug | feature | feedback
    title: str
    body: str = ""


@router.get("/health", response_model=HealthOut)
async def health(db: DbDep):
    db_ok = "up"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = "down"
    return HealthOut(
        status="ok",
        environment=settings.environment,
        database=db_ok,
        fake_ai_pipeline=settings.fake_ai_pipeline,
    )


@router.get("/announcements", response_model=list[AnnouncementOut])
async def active_announcements(db: DbDep):
    rows = (
        await db.scalars(
            select(Announcement)
            .where(Announcement.status == "Published")
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
