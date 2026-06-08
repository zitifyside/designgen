"""사용자 알림."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update

from app.core.deps import CurrentUser, DbDep
from app.models.notification import Notification
from app.schemas.common import Message
from app.schemas.notification import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(user: CurrentUser, db: DbDep):
    rows = (
        await db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
        )
    ).all()
    return [NotificationOut.model_validate(n) for n in rows]


@router.patch("/{notification_id}/read", response_model=Message)
async def mark_read(notification_id: str, user: CurrentUser, db: DbDep):
    n = await db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    n.read = True
    return Message(detail="Marked read")


@router.post("/read-all", response_model=Message)
async def mark_all_read(user: CurrentUser, db: DbDep):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)  # noqa: E712
        .values(read=True)
    )
    return Message(detail="All marked read")


@router.delete("/{notification_id}", response_model=Message)
async def delete_notification(notification_id: str, user: CurrentUser, db: DbDep):
    n = await db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    await db.delete(n)
    return Message(detail="Deleted")
