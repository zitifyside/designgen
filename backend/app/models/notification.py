"""사용자 알림 모델."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, id_column


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[str] = id_column("ntf")
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # 카테고리: generation | billing | system | marketing
    category: Mapped[str] = mapped_column(String(20), default="system")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    href: Mapped[str | None] = mapped_column(String(512), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
